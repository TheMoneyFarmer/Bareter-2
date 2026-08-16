import UIKit

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

}
