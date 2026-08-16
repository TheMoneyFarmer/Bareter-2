import UIKit
import Capacitor

/// Adopts the UIScene lifecycle the app was missing entirely — no
/// UIApplicationSceneManifest, no SceneDelegate, storyboard-only launch via
/// the legacy implicit AppDelegate path. On a strict-enough iOS runtime that
/// gap trips UIKit's own "no scene lifecycle adoption" diagnostic hard
/// enough to terminate the process before AppDelegate ever runs (confirmed
/// via a crash report: EXC_BREAKPOINT/SIGTRAP inside
/// UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption, with zero
/// app frames in the trace — nothing app-specific was even running yet).
///
/// This class is intentionally near-empty. Info.plist's UIApplicationSceneManifest
/// declares UISceneStoryboardFile = "Main", so UIKit builds the window and
/// loads Main.storyboard's initial view controller (CAPBridgeViewController)
/// automatically the same way the legacy path always did — this doesn't
/// change what launches, only how the OS is told the app is ready for it.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {

    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        // Nothing to do here — see the class comment. UIKit populates
        // `window` from the storyboard-based scene configuration in
        // Info.plist before this method is even called.
    }

    // Once a UISceneDelegate exists, iOS routes incoming URLs HERE instead of
    // to AppDelegate's `application(_:open:options:)` — that method still
    // exists and still runs on cold launch, but no longer fires for a URL
    // opened while the app is already running under a scene.
    //
    // Google Sign-In registers a custom URL scheme
    // (com.googleusercontent.apps.<client-id>, see Info.plist) and redirects
    // back into the app through it after account selection. Before this
    // scene delegate was introduced that redirect reached
    // ApplicationDelegateProxy via AppDelegate; after, it reached nothing —
    // the plugin never received its callback and the flow crashed instead of
    // completing. Forwarding to the same proxy AppDelegate already uses
    // restores that path without duplicating any plugin-specific logic.
    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        guard let context = URLContexts.first else { return }
        _ = ApplicationDelegateProxy.shared.application(
            UIApplication.shared,
            open: context.url,
            options: [
                .sourceApplication: context.options.sourceApplication as Any,
                .annotation: context.options.annotation as Any,
                .openInPlace: context.options.openInPlace,
            ]
        )
    }

    // Same gap, same fix, for Universal Links (e.g. a password-reset link
    // opened from Mail) rather than a custom-scheme redirect — the scene
    // delegate is where `continue userActivity` arrives now too.
    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        _ = ApplicationDelegateProxy.shared.application(
            UIApplication.shared,
            continue: userActivity,
            restorationHandler: { _ in }
        )
    }

}
