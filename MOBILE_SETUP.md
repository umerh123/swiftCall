# Mobile app setup — Android

This turns the web dialer (`webapp/`) into a real Android app (`mobile/`) that
rings, wakes the phone, and shows a proper incoming-call screen for calls, and
pushes notifications for texts — even when the app is closed.

How it works, in short:

- **Calls**: the app uses Telnyx's own Android calling SDK. When you're not
  connected (app closed/backgrounded), Telnyx pushes straight to the phone via
  Firebase and the SDK shows the incoming-call notification, plays a ringtone,
  and reconnects automatically when you answer. This needs a Firebase project,
  but no changes to how Telnyx routes calls.
- **Texts**: `api/webhook.php` on your server pushes a notification itself
  whenever Telnyx reports an inbound SMS, using the same Firebase project.

You need three things you didn't need for the web app: a **Firebase project**,
**Android Studio** (or just its command-line SDK) to build the app, and about
20 minutes.

---

## 0. Re-upload the backend

The `webapp/` folder picked up a few additions since you first set it up
(mobile sign-in, push notifications). Re-upload the whole `webapp/` folder to
your host the same way you did the first time (Step 1 in `SETUP.md`), or at
least these changed/new files:

```
.htaccess
config.php
includes/auth.php
includes/db.php
includes/fcm.php          (new)
api/mobile_auth.php       (new)
api/push_register.php     (new)
api/webhook.php
api/voicemails.php
```

Nothing else changes — your existing `config.php` values, database, and the
web app itself keep working exactly as before.

---

## 1. Create a Firebase project

1. Go to [console.firebase.google.com](https://console.firebase.google.com) →
   **Add project** → name it anything (e.g. "SwiftCall Dialer") → you can
   disable Google Analytics for this, it's not needed.
2. Once created, click **Add app** → the **Android** icon.
   - **Android package name**: `com.swiftcall.dialer` (must match exactly)
   - Nickname: anything
   - Skip the SHA-1 field — not needed here.
3. Download the **`google-services.json`** it offers you. Save it as:
   ```
   mobile/android/app/google-services.json
   ```
   (There's a `google-services.example.json` next to it showing the shape —
   don't use that one, it's a placeholder.)

---

## 2. Generate a service-account key (used twice)

This is what lets *your server* and *Telnyx* each send push notifications
through your Firebase project.

1. In the Firebase console: **Project settings** (gear icon) → **Service
   accounts** tab → **Generate new private key**. Confirm — it downloads a
   JSON file.
2. **Upload that file to your server** at:
   ```
   data/fcm-service-account.json
   ```
   (same `data/` folder the app already writes its database into — it's
   already blocked from direct web access by `.htaccess`, so this is safe.)
3. **Keep the file** — you need to paste its contents into Telnyx next.

---

## 3. Tell Telnyx how to push calls to the phone

1. In the [Telnyx portal](https://portal.telnyx.com): **API Keys** (left
   sidebar) → **Credentials** tab → **Add** → **Android Credential**.
   - Give it a name.
   - Paste the **entire contents** of the service-account JSON file from
     step 2 into the **Project Account JSON** field.
   - Save.
2. Go to **Voice → Connections** → open your `Browser Dialer` credential
   connection (the one from `SETUP.md` step 3D) → **WebRTC** tab → under
   **Android**, select the push credential you just created → Save.

That's it for Telnyx — incoming calls now wake the app on their own.

---

## 4. Build the app

### Option A — let GitHub build it for you (no Android Studio needed)

`.github/workflows/build-android.yml` is already set up in this repo. Once
`mobile/android/app/google-services.json` is committed and pushed (step 1.3 —
note it's `.gitignore`d by default, so add it explicitly:
`git add -f mobile/android/app/google-services.json`), GitHub automatically
builds an installable APK on every push that touches `mobile/`.

To get the file:

1. Push your commit (with `google-services.json` included) to GitHub.
2. Go to the repo's **Actions** tab → **Build Android APK** → the latest run.
3. Once it finishes (a few minutes), scroll to **Artifacts** → download
   **swiftcall-dialer-android** → unzip it → you have `app-release.apk`.
4. Copy that to your phone and install it (allow "install from unknown
   sources" once, since this isn't going through the Play Store).

You can also trigger a build manually anytime from **Actions → Build Android
APK → Run workflow**, without needing a new push.

### Option B — build it yourself locally

You need [Android Studio](https://developer.android.com/studio) installed
(it bundles the Android SDK) — or just the command-line SDK tools if you'd
rather not install the full IDE. You also need Node.js 22+ (same as the rest
of this repo).

```
cd mobile
npm install
```

**To run on a connected phone or emulator (debug build):**

```
npx react-native run-android
```

**To build an installable release APK:**

```
cd android
./gradlew assembleRelease
```

The APK comes out at
`mobile/android/app/build/outputs/apk/release/app-release.apk`. Copy it to
your phone (email it to yourself, use `adb install`, whatever's easiest) and
install it.

*(Either way, the release build is signed with the project's auto-generated
debug keystore, which is fine for installing on your own phone. If you ever
want to publish this to the Play Store, you'll need to generate a proper
release keystore — see React Native's
["Signed APK"](https://reactnative.dev/docs/signed-apk-android) guide.)*

---

## 5. Sign in and test

1. Open the app. On first launch it asks for:
   - **Server address** — the same URL from `config.php`'s `APP_URL`, e.g.
     `https://yourdomain.com/dialer`
   - **Username / password** — the same login you use on the web app.
2. Allow the notification permission when Android asks (this is required —
   without it, neither calls nor texts can notify you).
3. **Test a call**: from another phone, call your Telnyx number. With the
   app fully closed and the screen off, the phone should wake up, ring, and
   show an answer/decline screen.
4. **Test a text**: send an SMS to your Telnyx number. You should get a
   notification even with the app closed; tapping it opens the app.
5. **Test outgoing**: use the keypad tab to call your own cell number.

---

## Troubleshooting

| Problem | Likely cause |
|---|---|
| Build fails looking for `google-services.json` | You skipped step 1.3 — it must be at `mobile/android/app/google-services.json` exactly. |
| App builds but calls never ring when the app is closed | Step 3 wasn't completed — double check the Android push credential is actually attached to the `Browser Dialer` connection's WebRTC tab. |
| Texts don't push a notification, but calls work fine | `data/fcm-service-account.json` is missing/unreadable on the server, or `FCM_SERVICE_ACCOUNT_PATH` in `config.php` doesn't match. Check **Team → (admin) → System logs** in the web app for `fcm_token_error` / `fcm_send_error` entries. |
| "Your account has no calling line set up yet" after signing in | Same as the web app — an admin needs to set your SIP username/password on the **Team** screen (in the web app) first. |
| Ringtone doesn't stop after answering/declining | Rare edge case if the notification tap doesn't reach `MainActivity` — it has a 45-second hard cutoff either way. |
| `npx tsc --noEmit` shows errors under `node_modules/@telnyx/react-native-voice-sdk` | Pre-existing typing gaps in that package's own published source (WebRTC DOM types) — unrelated to this app's code and doesn't affect the actual build. |

---

## Known v1 limitations

- **Android only.** iOS would need CallKit + PushKit, an Apple Developer
  Program membership, and a Mac to build — none of which were part of this
  setup. The backend changes here don't block adding it later.
- **Voicemail playback** opens the recording in your phone's default audio/
  browser app rather than an in-app player, to keep the native dependency
  surface small on a build that couldn't be test-compiled in this
  environment. Swapping in an in-app player later (e.g. `react-native-sound`
  or `react-native-track-player`) is a self-contained change to
  `mobile/src/screens/VoicemailScreen.tsx`.
- **No custom app icon yet** — it ships with the default React Native
  launcher icon. Swap `mobile/android/app/src/main/res/mipmap-*/ic_launcher*`
  with your own (Android Studio's Image Asset tool makes this easy from a
  single source image, e.g. `webapp/assets/icon-512.png`).
