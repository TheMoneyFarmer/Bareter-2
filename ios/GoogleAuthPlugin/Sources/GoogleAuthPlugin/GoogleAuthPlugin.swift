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

    var signInCall: CAPPluginCall!
    var googleSignIn: GIDSignIn!
    var googleSignInConfiguration: GIDConfiguration!
    var forceAuthCode: Bool = false
    var additionalScopes: [String]!

    func loadSignInClient(customClientId: String, customScopes: [String]) {
        googleSignIn = GIDSignIn.sharedInstance

        let serverClientId = getServerClientIdValue()
        googleSignInConfiguration = GIDConfiguration(clientID: customClientId, serverClientID: serverClientId)

        let defaultGrantedScopes = ["email", "profile", "openid"]
        additionalScopes = customScopes.filter { !defaultGrantedScopes.contains($0) }

        forceAuthCode = getConfig().getBoolean("forceCodeForRefreshToken", false)

        NotificationCenter.default.addObserver(self, selector: #selector(handleOpenUrl(_:)), name: Notification.Name(Notification.Name.capacitorOpenURL.rawValue), object: nil)
    }

    public override func load() {}

    @objc func initialize(_ call: CAPPluginCall) {
        guard let clientId = call.getString("clientId") ?? getClientIdValue() else {
            NSLog("no client id found in config")
            call.resolve()
            return
        }

        let customScopes = call.getArray("scopes", String.self) ?? (getConfig().getArray("scopes") as? [String]) ?? []
        forceAuthCode = call.getBool("grantOfflineAccess") ?? getConfig().getBoolean("forceCodeForRefreshToken", false)

        loadSignInClient(customClientId: clientId, customScopes: customScopes)
        call.resolve()
    }

    @objc func signIn(_ call: CAPPluginCall) {
        signInCall = call
        DispatchQueue.main.async {
            if self.googleSignIn.hasPreviousSignIn() && !self.forceAuthCode {
                self.googleSignIn.restorePreviousSignIn { user, error in
                    if let error = error {
                        self.signInCall?.reject(error.localizedDescription)
                        return
                    }
                    self.resolveSignInCallWith(user: user!)
                }
            } else {
                let presentingVc = self.bridge!.viewController!
                self.googleSignIn.signIn(with: self.googleSignInConfiguration, presenting: presentingVc, hint: nil, additionalScopes: self.additionalScopes) { user, error in
                    if let error = error {
                        self.signInCall?.reject(error.localizedDescription, "\(error._code)")
                        return
                    }
                    self.resolveSignInCallWith(user: user!)
                }
            }
        }
    }

    @objc func refresh(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if self.googleSignIn.currentUser == nil {
                call.reject("User not logged in.")
                return
            }
            self.googleSignIn.currentUser!.authentication.do { authentication, error in
                guard let authentication = authentication else {
                    call.reject(error?.localizedDescription ?? "Something went wrong.")
                    return
                }
                let authenticationData: [String: Any] = [
                    "accessToken": authentication.accessToken,
                    "idToken": authentication.idToken ?? NSNull(),
                    "refreshToken": authentication.refreshToken
                ]
                call.resolve(authenticationData)
            }
        }
    }

    @objc func signOut(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.googleSignIn.signOut()
        }
        call.resolve()
    }

    @objc func handleOpenUrl(_ notification: Notification) {
        guard let object = notification.object as? [String: Any],
              let url = object["url"] as? URL else { return }
        googleSignIn.handle(url)
    }

    func getClientIdValue() -> String? {
        if let clientId = getConfig().getString("iosClientId") { return clientId }
        if let clientId = getConfig().getString("clientId") { return clientId }
        if let path = Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist"),
           let dict = NSDictionary(contentsOfFile: path) as? [String: AnyObject],
           let clientId = dict["CLIENT_ID"] as? String { return clientId }
        return nil
    }

    func getServerClientIdValue() -> String? {
        return getConfig().getString("serverClientId")
    }

    func resolveSignInCallWith(user: GIDGoogleUser) {
        var userData: [String: Any] = [
            "authentication": [
                "accessToken": user.authentication.accessToken,
                "idToken": user.authentication.idToken ?? NSNull(),
                "refreshToken": user.authentication.refreshToken
            ],
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
