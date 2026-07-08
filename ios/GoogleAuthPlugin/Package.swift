// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "GoogleAuthPlugin",
    platforms: [.iOS(.v15)],
    products: [
        .library(name: "GoogleAuthPlugin", targets: ["GoogleAuthPlugin", "GoogleAuthPluginObjC"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "8.4.1"),
        .package(url: "https://github.com/google/GoogleSignIn-iOS", "6.0.0"..<"7.0.0"),
    ],
    targets: [
        .target(
            name: "GoogleAuthPlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "GoogleSignIn", package: "GoogleSignIn-iOS"),
            ],
            path: "Sources/GoogleAuthPlugin"
        ),
        .target(
            name: "GoogleAuthPluginObjC",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                "GoogleAuthPlugin",
            ],
            path: "Sources/GoogleAuthPluginObjC",
            publicHeadersPath: "."
        ),
    ]
)
