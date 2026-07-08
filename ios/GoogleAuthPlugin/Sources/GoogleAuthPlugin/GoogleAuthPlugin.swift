import Foundation
import Capacitor
import GoogleSignIn

@objc(GoogleAuth)
public class GoogleAuth: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "GoogleAuth"
    public let jsName = "GoogleAuth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "initialize", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "signIn", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "refresh", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "signOut", returnType: CAPPluginReturnPromise),
    ]

    // No implicitly-unwrapped optionals — proper optionals throughout
    private var signInCall: CAPPluginCall?
    private var gsi: GIDSignIn?
    private var gsiConfig: GIDConfiguration?
    private var forceAuthCode: Bool = false
    private var additionalScopes: [String] = []

    public override func load() {}

    @objc func initialize(_ call: CAPPluginCall) {
        guard let clientId = call.getString("clientId") ?? getClientIdValue() else {
            call.reject("No Google client ID. Pass clientId to initialize() or set iosClientId in capacitor.config")
            return
        }

        let serverClientId = getConfig().getString("serverClientId")
        gsi = GIDSignIn.sharedInstance
        gsiConfig = GIDConfiguration(clientID: clientId, serverClientID: serverClientId)

        let defaultScopes: Set<String> = ["email", "profile", "openid"]
        let requested = call.getArray("scopes", String.self)
            ?? (getConfig().getArray("scopes") as? [String])
            ?? []
        additionalScopes = requested.filter { !defaultScopes.contains($0) }
        forceAuthCode = call.getBool("grantOfflineAccess")
            ?? getConfig().getBoolean("forceCodeForRefreshToken", false)

        NotificationCenter.default.addObserver(
            self, selector: #selector(handleOpenUrl(_:)),
            name: Notification.Name(Notification.Name.capacitorOpenURL.rawValue),
            object: nil)

        call.resolve()
    }

    @objc func signIn(_ call: CAPPluginCall) {
        // Nil-check BEFORE dispatching to main thread so errors surface immediately
        guard let gsi = gsi else {
            call.reject("GoogleAuth not initialized — call initialize() first")
            return
        }
        guard let config = gsiConfig else {
            call.reject("GoogleAuth configuration missing")
            return
        }

        signInCall = call
        let scopes = additionalScopes
        let force = forceAuthCode

        DispatchQueue.main.async {
            guard let presentingVc = self.bridge?.viewController else {
                self.signInCall?.reject("No presenting view controller")
                return
            }

            if gsi.hasPreviousSignIn() && !force {
                gsi.restorePreviousSignIn { user, error in
                    if let error = error {
                        self.signInCall?.reject(error.localizedDescription)
                        return
                    }
                    if let user = user {
                        self.resolveSignInCallWith(user: user)
                    } else {
                        self.signInCall?.reject("Restore sign-in returned no user")
                    }
                }
            } else {
                gsi.signIn(with: config, presenting: presentingVc, hint: nil, additionalScopes: scopes) { user, error in
                    if let error = error {
                        self.signInCall?.reject(error.localizedDescription, "\(error._code)")
                        return
                    }
                    if let user = user {
                        self.resolveSignInCallWith(user: user)
                    } else {
                        self.signInCall?.reject("Sign-in returned no user")
                    }
                }
            }
        }
    }

    @objc func refresh(_ call: CAPPluginCall) {
        guard let gsi = gsi else {
            call.reject("GoogleAuth not initialized")
            return
        }
        DispatchQueue.main.async {
            guard let currentUser = gsi.currentUser else {
                call.reject("User not logged in.")
                return
            }
            currentUser.authentication.do { authentication, error in
                guard let auth = authentication else {
                    call.reject(error?.localizedDescription ?? "Something went wrong.")
                    return
                }
                call.resolve([
                    "accessToken": auth.accessToken,
                    "idToken": auth.idToken ?? NSNull(),
                    "refreshToken": auth.refreshToken
                ])
            }
        }
    }

    @objc func signOut(_ call: CAPPluginCall) {
        gsi?.signOut()
        call.resolve()
    }

    @objc func handleOpenUrl(_ notification: Notification) {
        guard let object = notification.object as? [String: Any],
              let url = object["url"] as? URL else { return }
        gsi?.handle(url)
    }

    private func getClientIdValue() -> String? {
        if let id = getConfig().getString("iosClientId") { return id }
        if let id = getConfig().getString("clientId") { return id }
        if let path = Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist"),
           let dict = NSDictionary(contentsOfFile: path) as? [String: AnyObject],
           let id = dict["CLIENT_ID"] as? String { return id }
        return nil
    }

    private func resolveSignInCallWith(user: GIDGoogleUser) {
        var userData: [String: Any] = [
            "authentication": [
                "accessToken": user.authentication.accessToken,
                "idToken": user.authentication.idToken ?? NSNull(),
                "refreshToken": user.authentication.refreshToken
            ] as [String: Any],
            "serverAuthCode": user.serverAuthCode ?? NSNull(),
            "email": user.profile?.email ?? NSNull(),
            "familyName": user.profile?.familyName ?? NSNull(),
            "givenName": user.profile?.givenName ?? NSNull(),
            "id": user.userID ?? NSNull(),
            "name": user.profile?.name ?? NSNull()
        ]
        if let imageUrl = user.profile?.imageURL(withDimension: 100)?.absoluteString {
            userData["imageUrl"] = imageUrl
        }
        signInCall?.resolve(userData)
    }
}
