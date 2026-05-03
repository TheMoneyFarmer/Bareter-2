import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Cookie } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { COOKIE_OPEN_EVENT, readPrefs, writePrefs } from "@/lib/cookie-consent";

export function CookieConsent() {
  const [location] = useLocation();
  const [bannerOpen, setBannerOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  // Hide on the cookie policy page itself to avoid covering the doc.
  const isCookieDoc = location === "/legal/cookies";

  useEffect(() => {
    const existing = readPrefs();
    if (!existing && !isCookieDoc) {
      setBannerOpen(true);
    } else if (existing) {
      setAnalytics(existing.analytics);
      setMarketing(existing.marketing);
    }
  }, [isCookieDoc]);

  useEffect(() => {
    const onOpen = () => {
      const existing = readPrefs();
      if (existing) {
        setAnalytics(existing.analytics);
        setMarketing(existing.marketing);
      }
      setManageOpen(true);
    };
    window.addEventListener(COOKIE_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(COOKIE_OPEN_EVENT, onOpen);
  }, []);

  const acceptAll = () => {
    writePrefs({ analytics: true, marketing: true });
    setAnalytics(true);
    setMarketing(true);
    setBannerOpen(false);
    setManageOpen(false);
  };

  const rejectNonEssential = () => {
    writePrefs({ analytics: false, marketing: false });
    setAnalytics(false);
    setMarketing(false);
    setBannerOpen(false);
    setManageOpen(false);
  };

  const savePrefs = () => {
    writePrefs({ analytics, marketing });
    setBannerOpen(false);
    setManageOpen(false);
  };

  return (
    <>
      {bannerOpen && !isCookieDoc && (
        <div
          className="fixed inset-x-0 bottom-0 z-[60] px-3 pb-3 sm:px-4 sm:pb-4 md:right-4 md:left-auto md:bottom-4 md:max-w-md md:px-0 md:pb-0"
          role="dialog"
          aria-label="Cookie consent"
          data-testid="cookie-consent-banner"
        >
          <div className="rounded-lg border border-border bg-background shadow-xl p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-0.5">
                <Cookie className="h-5 w-5 text-bareter-teal" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-foreground" data-testid="text-cookie-title">
                  We use cookies
                </h3>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                  Bareter uses cookies to keep you signed in, remember your preferences, and
                  understand how the platform is used. To continue using Bareter, choose how
                  cookies should be used. Read our{" "}
                  <Link
                    href="/legal/cookies"
                    className="underline text-bareter-teal hover:text-bareter-teal/80"
                    data-testid="link-cookie-policy"
                  >
                    Cookie Policy
                  </Link>
                  .
                </p>
              </div>
            </div>

            <div className="mt-4 flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setManageOpen(true)}
                data-testid="button-manage-cookies"
              >
                Manage
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={rejectNonEssential}
                data-testid="button-reject-cookies"
              >
                Reject non-essential
              </Button>
              <Button size="sm" onClick={acceptAll} data-testid="button-accept-cookies">
                Accept all
              </Button>
            </div>
          </div>
        </div>
      )}

      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent className="sm:max-w-md" data-testid="dialog-cookie-prefs">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Cookie className="h-5 w-5 text-bareter-teal" />
              Cookie preferences
            </DialogTitle>
            <DialogDescription>
              Choose which cookies Bareter may use. You can change this any time from the footer.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <PrefRow
              title="Strictly necessary"
              description="Required for sign-in, security, and core platform functionality. Always on."
              checked
              disabled
              testId="cookie-pref-essential"
            />
            <PrefRow
              title="Analytics"
              description="Anonymised usage data so we can improve features and fix errors."
              checked={analytics}
              onCheckedChange={setAnalytics}
              testId="cookie-pref-analytics"
            />
            <PrefRow
              title="Marketing"
              description="Conversion tracking and retargeting pixels for relevant ads off-platform."
              checked={marketing}
              onCheckedChange={setMarketing}
              testId="cookie-pref-marketing"
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={rejectNonEssential}
              data-testid="button-prefs-reject"
            >
              Reject non-essential
            </Button>
            <Button onClick={savePrefs} data-testid="button-prefs-save">
              Save preferences
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function PrefRow({
  title,
  description,
  checked,
  disabled,
  onCheckedChange,
  testId,
}: {
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange?: (v: boolean) => void;
  testId: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-md border border-border p-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{description}</p>
      </div>
      <Switch
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
        data-testid={testId}
      />
    </div>
  );
}
