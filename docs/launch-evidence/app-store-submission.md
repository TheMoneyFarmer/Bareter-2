# iOS App Store Submission — Evidence

**Status:** NOT STARTED — Apple Developer Program enrollment has not been
initiated as of this file's creation.

> The procedure lives in
> [`../APP_STORE_LAUNCH_CHECKLIST.md`](../APP_STORE_LAUNCH_CHECKLIST.md).

---

## 1. Apple Developer Program enrollment

| Field | Value |
| --- | --- |
| Enrollment type | `TODO: Individual / Organization` |
| Date submitted | `TODO: YYYY-MM-DD` |
| Date approved | `TODO: YYYY-MM-DD` |
| Team ID | `TODO: 10-character Team ID from Membership details` |

## 2. App ID and App Store Connect record

| Field | Value |
| --- | --- |
| Bundle ID registered | `com.bareter.app` (fixed — do not change) |
| Push Notifications capability enabled | `[ ] yes` |
| Sign in with Apple capability enabled | `[ ] yes` |
| App Store Connect app created (date) | `TODO: YYYY-MM-DD` |
| App Store display name claimed | `TODO: exact name reserved` |

## 3. Signing, provisioning, push

| Field | Value |
| --- | --- |
| Automatic signing configured, no errors | `[ ] yes` |
| APNs key created (Key ID) | `TODO: Key ID from developer.apple.com/account/resources/authkeys` |
| APNs key uploaded to Firebase | `[ ] yes` |
| `.p8` file stored securely (where) | `TODO: e.g. "1Password vault: Bareter Infra"` — never commit this file |

## 4. Stable Xcode confirmation

| Field | Value |
| --- | --- |
| Xcode version used (stable, non-beta) | `TODO: e.g. Xcode 16.2` |
| Date rebuilt and relaunched | `TODO: YYYY-MM-DD` |
| Simulator launch: app renders real UI, no crash | `[ ] yes` |
| Real device launch tested | `[ ] yes  [ ] not available` |

Compare against the beta-Xcode verification already on record for this
build: Xcode 27 beta (27A5194q), simulator "iPhone 17", app launched to
the live browse/category UI without crashing, 2026-08-16. This row exists
to confirm the same holds on what App Store review actually runs.

## 5. App Privacy

| Field | Value |
| --- | --- |
| Nutrition Label answered per checklist §5.1 table | `[ ] yes` |
| Privacy Report generated from a real Xcode archive | `[ ] yes` |
| Reconciled against `ios/App/App/PrivacyInfo.xcprivacy` (date) | `TODO: YYYY-MM-DD` |
| Any differences found and resolved | `TODO: describe, or "none"` |

## 6. Age rating & export compliance

| Field | Value |
| --- | --- |
| Age rating assigned | `TODO: e.g. 12+` |
| Export compliance answered | `[ ] yes — standard HTTPS/TLS exemption` |

## 7. Store listing

| Field | Value |
| --- | --- |
| Screenshots uploaded (all required sizes) | `[ ] yes` |
| Subtitle, description, keywords set | `[ ] yes` |
| Support URL | `TODO: e.g. https://bareter.com/help` |
| Privacy Policy URL | `TODO: e.g. https://bareter.com/privacy` |
| Category | `TODO:` |
| Price / availability | `Free` / `TODO: geography, matching web launch decision` |

## 8. TestFlight real-device verification

| Field | Value |
| --- | --- |
| Build uploaded and processed (date) | `TODO: YYYY-MM-DD` |
| Installed on a real iPhone via TestFlight | `[ ] yes` |
| Native Sign in with Apple — first-time + returning login | `[ ] yes` |
| Native Sign in with Google | `[ ] yes` |
| Video upload + playback (own device) | `[ ] yes` |
| Video playback confirmed on a second, non-Apple device/browser | `[ ] yes` |
| Push notification received, app backgrounded | `[ ] yes` |
| Camera / photo library permission + capture flow | `[ ] yes` |
| Device + iOS version tested on | `TODO: e.g. iPhone 15, iOS 18.2` |

## 9. Submission

| Field | Value |
| --- | --- |
| Demo/reviewer account provided in App Review Information | `[ ] yes — TODO: note the test account email` |
| Submitted (UTC timestamp) | `TODO:` |
| Build number submitted | `TODO:` |
| Outcome | `TODO: Approved / Rejected — reason / Waiting for Review` |

---

## Sign-off

**NOT SIGNED — Stage 1 (Apple Developer enrollment) not yet started.**

| Field | Value |
| --- | --- |
| Signed by | `TODO: founder full name` |
| Date (UTC) | `TODO: YYYY-MM-DD` |
| App Store status at sign-off | `TODO: Ready for Sale / Waiting for Review` |
