<?php
/* ============================================================
   EDIT THIS FILE. Nothing else needs changing.
   Fill in the values between the quotes.

   NOTE ON MULTI-USER: the app now supports multiple people, each with
   their own number and their own login — managed from the "Team" screen
   inside the app (only visible to admins), not from this file. The
   settings below are only ever used ONCE, the very first time the app
   runs, to create your own account automatically using whatever is here.
   After that, editing these does nothing — change your own number,
   password, or SIP details from the app's Team screen instead.
   ============================================================ */

// ---- 1. Your login (make up any username and password) ----
define('APP_USER', 'admin');
define('APP_PASS', 'change-this-password');

// ---- 2. From Telnyx > API Keys ----
define('TELNYX_API_KEY', '');          // starts with KEY...
define('TELNYX_PUBLIC_KEY', '');       // "Public Key" on the same page

// ---- 3. Your Telnyx phone number, with country code ----
define('TELNYX_NUMBER', '+1');         // e.g. +12125551234

// ---- 4. From Telnyx > Messaging > your Messaging Profile ----
//         Shared across everyone's numbers.
define('MESSAGING_PROFILE_ID', '');

// ---- 5. From Telnyx > Voice > Credential Connections ----
//         (for talking through the browser)
define('SIP_CONNECTION_ID', '');
define('SIP_USERNAME', '');
define('SIP_PASSWORD', '');

// ---- 6. The web address where you uploaded this app ----
//         No trailing slash. Must start with https://
define('APP_URL', 'https://yourdomain.com/dialer');

// ---- 7. Optional: live call transcription, both sides of the call ----
//         Leave blank to disable the Transcript button entirely.
//         Get a key at deepgram.com — new accounts include free trial credit.
define('DEEPGRAM_API_KEY', '');

// ---- 8. Your timezone ----
date_default_timezone_set('America/New_York');

// ---- 9. Optional: mobile app push notifications for incoming texts ----
//         See MOBILE_SETUP.md. Incoming *calls* don't need this — Telnyx
//         pushes those straight to the phone once the Android push
//         credential is set up in the Telnyx portal. This is only for SMS.
//         Put the Firebase service-account JSON at data/fcm-service-account.json
//         (that folder is already blocked from direct web access).
define('FCM_SERVICE_ACCOUNT_PATH', __DIR__ . '/data/fcm-service-account.json');


/* ============================================================
   Stop editing here.
   ============================================================ */
define('DB_PATH', __DIR__ . '/data/dialer.sqlite');
define('TELNYX_API', 'https://api.telnyx.com/v2');
