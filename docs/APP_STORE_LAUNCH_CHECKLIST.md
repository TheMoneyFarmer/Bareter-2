# App Store Launch Checklist — actions only humans can do

Companion to [`FOUNDER_LAUNCH_CHECKLIST.md`](FOUNDER_LAUNCH_CHECKLIST.md),
scoped to the iOS native app specifically. Same rules apply: every item here
needs a real Apple ID, a paid enrollment, a device, or a click in a
dashboard the agent has no login for. They're ordered — earlier items unlock
later ones.

**Starting point, as of this checklist:** Apple Developer Program
enrollment has **not** been started. Everything from Stage 2 onward is
blocked on Stage 1.

For each item: **Who** you need, **Why** it matters, **Steps**, **Done
when**, and where to record proof. If a row is red on submission day,
don't submit — Apple's review queue is slow to re-enter after a rejection,
so it's cheaper to catch it here.

---

## Stage 0 — What's already true, so you don't re-derive it

These were verified directly against the code and a real build this
session — not assumed:

| Fact | Value | How it was confirmed |
| --- | --- | --- |
| Bundle ID | `com.bareter.app` | `capacitor.config.ts` + `ios/App/App.xcodeproj/project.pbxproj`, must match what you register in Stage 2 |
| Marketing version / build | `1.1` / `3` | `project.pbxproj` (`MARKETING_VERSION`, `CURRENT_PROJECT_VERSION`) |
| App icon | Present, correct modern single-1024px format | `Assets.xcassets/AppIcon.appiconset` |
| Camera / photo library permission strings | Present and correctly worded | `Info.plist` |
| Push notifications | Entitlement set to `production`; Firebase configured | `App.entitlements`, `GoogleService-Info.plist` present |
| Sign in with Apple | **Native**, not just web-redirect | `server/routes.ts` `/api/auth/apple/native`; `SceneDelegate.swift`/plugin wiring this session |
| Sign in with Google | Native | Pre-existing, `/api/auth/google/native` |
| Privacy Manifest | Present, wired into the build | `ios/App/App/PrivacyInfo.xcprivacy` — see Stage 5, it must match what you enter in App Store Connect |
| Launch crash (missing Scene lifecycle) | **Fixed** | `SceneDelegate.swift` + `Info.plist` `UIApplicationSceneManifest`, verified against a real simulator run |
| Build tested on | Xcode 27 **beta** only | No stable Xcode was available this session — Stage 4 exists specifically to re-confirm on stable |

If any of these no longer match reality when you reach that stage, stop
and re-verify before proceeding — this table is a snapshot, not a promise.

---

## Stage 1 — Apple Developer Program enrollment

### 1.1 Enroll
- **Who:** Founder (needs a real Apple ID, a valid ID document or D-U-N-S
  number if enrolling as an organization, and a credit card).
- **Why:** Nothing past this point exists without it — no App Store
  Connect record, no push certificates, no Sign in with Apple capability,
  no TestFlight, no submission.
- **Steps:**
  1. Decide: enroll as an **Individual** or as an **Organization**
     ("Bareter" / your legal entity). Organization requires a D-U-N-S
     number and legal-entity verification, and takes longer — start it
     first if you want the org name on the App Store listing (shows as
     "Bareter, Inc." vs your personal name).
  2. `https://developer.apple.com/programs/enroll/`
  3. Pay the $99/year fee.
  4. Wait for approval (individual: usually same day–48h; organization:
     can take 1–2 weeks for D-U-N-S verification).
- **Done when:** You can log into
  `https://developer.apple.com/account` and see an active membership,
  and `https://appstoreconnect.apple.com` loads without a "not enrolled"
  error.
- **Evidence:** `docs/launch-evidence/app-store-submission.md` §1.

### 1.2 Note your Team ID
- **Who:** Founder.
- **Why:** Needed for provisioning profiles and for the automated-signing
  step in Stage 3.
- **Steps:** `developer.apple.com/account` → *Membership details* → copy
  the **Team ID** (10-character alphanumeric).
- **Done when:** Recorded in the evidence file.

---

## Stage 2 — App Store Connect: create the app record

### 2.1 Register the App ID (bundle identifier)
- **Who:** Founder.
- **Why:** The App ID is where capabilities (push, Sign in with Apple)
  get switched on at the Apple account level — the entitlement files in
  the repo declare *intent*, this is where Apple actually grants it.
- **Steps:**
  1. `developer.apple.com/account` → *Certificates, Identifiers &
     Profiles* → *Identifiers* → **+**.
  2. Type: **App IDs** → **App**.
  3. Bundle ID: **Explicit** → `com.bareter.app` (must match exactly —
     this is already fixed in the code, don't pick a different one).
  4. Under *Capabilities*, enable:
     - **Push Notifications**
     - **Sign In with Apple**
  5. Save.
- **Done when:** `com.bareter.app` appears in the Identifiers list with
  both capabilities checked.
- **Evidence:** `docs/launch-evidence/app-store-submission.md` §2.

### 2.2 Create the app in App Store Connect
- **Who:** Founder.
- **Steps:**
  1. `appstoreconnect.apple.com` → *My Apps* → **+** → *New App*.
  2. Platform: iOS. Name: **Bareter** (or your chosen App Store display
     name — this can differ from the app's internal name and is
     first-come-first-served across the whole App Store, so pick and
     claim it now even if you're not submitting yet).
  3. Primary language, Bundle ID: select `com.bareter.app` (now
     available since Stage 2.1). SKU: any internal string, e.g.
     `bareter-ios-1`.
- **Done when:** The app record exists and shows status **Prepare for
  Submission**.
- **Evidence:** `docs/launch-evidence/app-store-submission.md` §2.

---

## Stage 3 — Signing, provisioning, and push

### 3.1 Let Xcode manage signing (recommended over manual profiles)
- **Who:** Founder, with Xcode open and signed into the Apple ID from
  Stage 1.
- **Why:** Manual certificate/profile management is where most first-time
  submissions go wrong. Automatic signing has Xcode do it correctly.
- **Steps:**
  1. Open the project:
     ```
     npm run build:native && open -a "/Applications/Xcode.app" ios/App/App.xcodeproj
     ```
     (once you've installed the **stable** Xcode from Stage 4 — use that
     path here, not the beta one used during development.)
  2. Select the **App** target → *Signing & Capabilities*.
  3. Check **Automatically manage signing**. Team: select your team from
     Stage 1.2.
  4. Confirm the **Sign in with Apple** capability is listed (it should
     already be, from the `com.apple.developer.applesignin` entitlement
     already in the repo) — if Xcode shows a warning icon next to it,
     click it and let Xcode resolve/register it against your account.
  5. Confirm **Push Notifications** capability is also listed.
- **Done when:** No red errors in *Signing & Capabilities*, and the
  scheme at the top of Xcode shows a real device or "Any iOS Device"
  as a valid destination (not just simulators).
- **Evidence:** `docs/launch-evidence/app-store-submission.md` §3.

### 3.2 Create an APNs key for push notifications
- **Who:** Founder.
- **Why:** `App.entitlements` already declares `aps-environment =
  production` and `GoogleService-Info.plist` is present, but Firebase
  needs an Apple-issued APNs key to actually deliver push through APNs.
- **Steps:**
  1. `developer.apple.com/account` → *Keys* → **+**.
  2. Name it (e.g. "Bareter APNs"), check **Apple Push Notifications
     service (APNs)**, generate. **Download the `.p8` file immediately —
     Apple only lets you download it once.**
  3. Firebase console → Project settings → *Cloud Messaging* → *Apple
     app configuration* → upload the `.p8`, along with the Key ID (shown
     on the key you just created) and your Team ID from 1.2.
- **Done when:** Firebase console shows the APNs key as configured under
  your iOS app, with no error badge.
- **Evidence:** `docs/launch-evidence/app-store-submission.md` §3. Store
  the `.p8` file somewhere durable and access-controlled (a password
  manager or secrets vault) — **never commit it to git.**

---

## Stage 4 — Confirm the build on stable Xcode

### 4.1 Install release Xcode and rebuild
- **Who:** Founder (or whoever owns this Mac).
- **Why:** Everything built and verified this session — the crash fix,
  Apple Sign-In, the Privacy Manifest — was tested against **Xcode 27
  beta**, the only Xcode available at the time. Beta SDKs can behave
  differently from what's actually installed on App Store review's
  machines. This is the one open item from that work.
- **Steps:**
  1. Mac App Store → search "Xcode" → Install (multi-GB, budget real
     time). Or `developer.apple.com/download` for a specific stable
     version.
  2. Once installed:
     ```
     sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
     npm run build:native
     open ios/App/App.xcodeproj
     ```
  3. Build for a simulator (⌘R) and confirm the app launches to the
     actual UI (header, category browse grid, bottom nav) — same check
     performed this session on beta, now on stable.
  4. Build for a real physical iPhone if you have one available (Xcode
     → select your device as the destination → ⌘R) — the simulator
     can't test the camera, push notifications, or a real Sign in with
     Apple prompt.
- **Done when:** The app launches without crashing on stable Xcode, in
  both the simulator and (if available) a real device.
- **Evidence:** `docs/launch-evidence/app-store-submission.md` §4 —
  note the exact stable Xcode version used.

---

## Stage 5 — App Privacy questionnaire (must match the code)

### 5.1 Fill in App Store Connect's Privacy "Nutrition Label"
- **Who:** Founder.
- **Why:** Apple cross-checks what you declare here against the
  technical `PrivacyInfo.xcprivacy` manifest already in the repo. A
  mismatch is a common rejection reason. Answer from the table below —
  it's a direct transcription of what the manifest already declares
  (written this session by reading the actual data the app collects,
  not guessed).
- **Steps:** App Store Connect → your app → *App Privacy* → answer:

  | Data type | Collected? | Linked to user? | Used to track? | Purpose |
  | --- | --- | --- | --- | --- |
  | Email Address | Yes | Yes | No | App Functionality |
  | Phone Number | Yes | Yes | No | App Functionality |
  | Name | Yes | Yes | No | App Functionality |
  | Photos or Videos | Yes | Yes | No | App Functionality |
  | User ID | Yes | Yes | No | App Functionality |
  | Product Interaction | Yes | **No** (hashed, one-way) | No | Analytics |

  **"Used to track" is No across the board** — confirmed by reading
  `client/src/lib/posthog.ts`: `localStorage` persistence (not IDFA),
  autocapture off, `identifyUser()` sends a SHA-256 hash of the internal
  user id, never the raw id. If PostHog's config ever changes to a
  device-identifier mode or an ad SDK is added, this whole section and
  `NSPrivacyTracking` in the manifest must be revisited together.
- **Done when:** Every row above is entered and the App Privacy section
  shows no "incomplete" warning.
- **Evidence:** `docs/launch-evidence/app-store-submission.md` §5.

### 5.2 Regenerate and reconcile the technical manifest (do this once stable Xcode is installed)
- **Who:** Founder.
- **Why:** `PrivacyInfo.xcprivacy` in the repo is a well-reasoned draft
  written by reading the code, not generated by Apple's own tooling —
  flagged as such when it was written. Xcode's Privacy Report sees the
  actual compiled dependency tree, which is more authoritative,
  especially now that the Apple Sign-In plugin has been added since the
  draft was written.
- **Steps:**
  1. In Xcode (stable): *Product* → *Archive*.
  2. In the Organizer window, right-click the archive → *Generate
     Privacy Report*.
  3. Compare its `NSPrivacyAccessedAPITypes` section against
     `ios/App/App/PrivacyInfo.xcprivacy`. Reconcile any difference —
     Xcode's version wins on required-reason API categories.
- **Done when:** The two agree, and the reconciled file is committed.
- **Evidence:** Note the reconciliation date in
  `docs/launch-evidence/app-store-submission.md` §5.

---

## Stage 6 — Age rating & export compliance

### 6.1 Age rating questionnaire
- **Who:** Founder.
- **Why:** Bareter has user-generated content (listings, images, chat)
  and no gambling/violence/mature content by design — but Apple still
  requires the questionnaire answered explicitly.
- **Steps:** App Store Connect → *App Information* → *Age Rating* →
  answer honestly. User-generated content + unrestricted web access
  (chat between users) will likely land at **12+** or **17+** depending
  on your answers about user-to-user communication — read each question,
  don't default-click.
- **Done when:** A rating is set and saved.

### 6.2 Export compliance
- **Who:** Founder.
- **Why:** Required on every submission. The app uses standard HTTPS/TLS
  only — no custom cryptography — which is the common "exempt" case, but
  you must answer the question, not assume it.
- **Steps:** When prompted during submission: "Does your app use
  encryption?" → Yes (HTTPS counts) → "Does it qualify for any of the
  exemptions?" → Yes, standard encryption exemption (HTTPS/TLS only,
  matches Apple's own examples of exempt use). If you're an organization
  account, you may need to also confirm this in *App Information* ahead
  of time and may need a one-time self-classification report to the
  U.S. government (Apple's flow tells you if this applies — it usually
  doesn't for HTTPS-only apps).
- **Done when:** No red flag on export compliance at submission time.

---

## Stage 7 — Store listing: screenshots, metadata, links

### 7.1 Screenshots
- **Who:** Founder / design.
- **Why:** Required for every supported device size before submission.
- **Steps:**
  1. Required sizes (check App Store Connect for the current exact
     list — it changes as new devices ship): 6.9" (iPhone 17 Pro Max
     class), 6.5" or 6.3", and iPad if you support it (check `Info.plist`
     — `UISupportedInterfaceOrientations~ipad` is already declared, so
     iPad screenshots are likely required).
  2. Easiest path: run the app in the matching simulators (`xcrun simctl
     list devices` to see what's available) and use ⌘S in Simulator to
     capture, or Xcode's own screenshot tooling.
  3. Show real product moments: the browse/category grid (same screen
     verified working this session), a listing detail with a video clip
     playing (now that transcoding makes it universal), the create-flow,
     a completed deal.
- **Done when:** At least one screenshot set uploaded per required size
  in App Store Connect.

### 7.2 Metadata
- **Who:** Founder / marketing.
- **Steps:** Fill in, in App Store Connect → *App Information* /
  *Version*:
  - **Subtitle** (30 chars) — short value prop under the app name.
  - **Description** — lead with the barter/exchange value prop; this is
    where "free during launch, no fees" (from the web pricing page) can
    also live if still accurate.
  - **Keywords** (100 chars, comma-separated, no spaces after commas).
  - **Support URL** — must be a real, live page (`https://bareter.com/help`
    exists per the web launch checklist).
  - **Marketing URL** (optional) — `https://bareter.com`.
  - **Privacy Policy URL** — required, must be live and must actually
    describe the data practices declared in Stage 5.
- **Done when:** Every field is filled and the version shows no
  "missing metadata" warning.

### 7.3 Category and pricing
- **Steps:** Primary category: likely **Shopping** or **Lifestyle**
  (Bareter is a marketplace, not strictly shopping — pick whichever
  best matches how you want to be discovered). Price: **Free**.
  Availability: match the web launch's geography decision (Stage 0.1 in
  `FOUNDER_LAUNCH_CHECKLIST.md` — UAE-only vs wider).
- **Done when:** Set and saved.

---

## Stage 8 — TestFlight: test on a real device before submitting

### 8.1 Upload a build to TestFlight
- **Who:** Founder.
- **Why:** This is the first time the app runs signed, on Apple's
  infrastructure, outside your own machine — the closest thing to a
  dress rehearsal for review.
- **Steps:**
  1. In Xcode (stable, signed per Stage 3): *Product* → *Archive*.
  2. In Organizer: *Distribute App* → *App Store Connect* → *Upload*.
  3. Wait for processing in App Store Connect → *TestFlight* (can take
     15 min–a few hours; Apple also runs an automated Privacy Manifest
     check here, which is another real-world check on Stage 5).
  4. Add yourself (and any teammates) as internal testers.
- **Done when:** The build appears under TestFlight with no processing
  error, and you've installed it via the TestFlight app on a real
  iPhone.

### 8.2 Test the specific things built this session, on a real device
- **Who:** Founder, on a real iPhone with a real Apple ID.
- **Why:** These cannot be fully verified in a simulator — this is the
  first real end-to-end check of each.
- **Steps, check each:**
  - [ ] **Native Sign in with Apple** — tap it on the login screen,
    complete the real `ASAuthorizationController` sheet, confirm you
    land signed in. Then sign out and back in a second time — confirm
    it recognizes the same account without asking for your name again
    (Apple only sends the name once; the server test suite
    (`tests/apple-native-auth.test.ts`) covers this in isolation, but
    only a real device proves the whole chain).
  - [ ] **Native Sign in with Google** — same check, confirm it still
    works after this session's changes (unmodified this session, but
    the Xcode project changed around it).
  - [ ] **Video upload + playback** — create or edit a listing, add a
    video clip recorded on the phone (iPhones default to HEVC/.MOV —
    exactly the case the server-side transcoding in
    `server/lib/video.ts` was built for). Confirm it plays back in the
    app. If you have a second, non-Apple device (Android, or just a
    laptop's Chrome), confirm it plays there too — that's the actual
    point of the transcoding.
  - [ ] **Push notifications** — trigger one (a message, a deal update)
    and confirm it's received on the device with the app backgrounded.
  - [ ] **Camera / photo library** — confirm the permission prompts show
    the correct text from `Info.plist` and that both photo capture and
    library picking work for a listing.
- **Done when:** Every box above is checked on a real device.
- **Evidence:** `docs/launch-evidence/app-store-submission.md` §8.

---

## Stage 9 — Submit for review

### 9.1 Final review and submit
- **Who:** Founder.
- **Prerequisites:** Stages 1–8 all green.
- **Steps:**
  1. App Store Connect → your app version → confirm every section
     (screenshots, metadata, privacy, age rating, build) shows no
     warning icon.
  2. Attach the TestFlight-uploaded build (Stage 8.1) to this version.
  3. Answer the remaining submission questions (advertising identifier
     usage — should be **No**, per the `NSPrivacyTracking=false` already
     confirmed; content rights; government app — No).
  4. *Submit for Review*.
- **Done when:** Status changes to **Waiting for Review**.
- **Evidence:** `docs/launch-evidence/app-store-submission.md` §9 — note
  the exact submission timestamp and build number.

### 9.2 If rejected
- **Who:** Founder.
- **Why:** First submissions are commonly rejected for small, fixable
  reasons — this is normal, not a crisis.
- **Steps:** Read the specific rejection reason in *Resolution Center*.
  Common ones worth pre-empting given what's in this app: incomplete
  App Privacy answers (Stage 5), a login-required demo account not
  provided for the reviewer (add one in the *App Review Information*
  notes — a real test account with a pre-verified email/phone so the
  reviewer isn't stuck at KYC), or broken metadata links (Stage 7.2).
  Fix, and resubmit — it goes back into the review queue, not to the
  back of a global line.
- **Done when:** Status is **Ready for Sale**.

---

## Quick "must be green to submit" summary

| # | Item | Done? |
| --- | --- | --- |
| 1 | Apple Developer Program enrollment approved | ☐ |
| 2 | App ID registered with Push + Sign in with Apple capabilities | ☐ |
| 3 | App Store Connect app record created | ☐ |
| 4 | Automatic signing configured in Xcode, no errors | ☐ |
| 5 | APNs key generated and uploaded to Firebase | ☐ |
| 6 | Build confirmed launching on **stable** (non-beta) Xcode | ☐ |
| 7 | App Privacy questionnaire matches `PrivacyInfo.xcprivacy` | ☐ |
| 8 | Privacy Manifest reconciled against Xcode's own Privacy Report | ☐ |
| 9 | Age rating + export compliance answered | ☐ |
| 10 | Screenshots (all required sizes) + metadata + Privacy Policy URL uploaded | ☐ |
| 11 | TestFlight build processed, installed on a real device | ☐ |
| 12 | Native Apple Sign-In, Google Sign-In, video playback, push, camera all verified on a real device | ☐ |
| 13 | Demo/reviewer test account provided in App Review Information | ☐ |
| 14 | Submitted, status **Waiting for Review** | ☐ |

When every box above is ticked → you're submitted. Apple's review is
typically 24–48 hours for a first submission; budget for at least one
round of feedback.
