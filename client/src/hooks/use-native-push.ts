import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";

export function useNativePush() {
  const { user } = useAuth();

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !user) return;

    let cleanup: (() => void) | undefined;

    (async () => {
      try {
        const { PushNotifications } = await import("@capacitor/push-notifications");

        let perm = await PushNotifications.checkPermissions();
        if (perm.receive === "prompt") {
          perm = await PushNotifications.requestPermissions();
        }
        if (perm.receive !== "granted") return;

        await PushNotifications.register();

        const regHandle = await PushNotifications.addListener(
          "registration",
          (token) => {
            apiRequest("POST", "/api/push/native-token", {
              token: token.value,
              platform: Capacitor.getPlatform(),
            }).catch(() => {});
          },
        );

        // When app is in foreground, notifications still arrive — we rely on
        // the existing polling to refresh UI; no extra toast needed here.
        const fgHandle = await PushNotifications.addListener(
          "pushNotificationReceived",
          (_notification) => {
            // foreground — polling already handles refresh
          },
        );

        // Tapped from background/closed → navigate to the relevant page
        const tapHandle = await PushNotifications.addListener(
          "pushNotificationActionPerformed",
          (action) => {
            const url: string | undefined = action.notification.data?.url;
            if (url) {
              // Use history API so wouter picks it up
              window.history.pushState({}, "", url);
              window.dispatchEvent(new PopStateEvent("popstate"));
            }
          },
        );

        cleanup = () => {
          regHandle.remove();
          fgHandle.remove();
          tapHandle.remove();
        };
      } catch (err) {
        console.error("[native-push] setup error:", err);
      }
    })();

    return () => cleanup?.();
  }, [user?.id]);
}
