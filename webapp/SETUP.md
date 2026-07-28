# Dialer — Setup Guide

Follow these in order. Takes about 30 minutes. No coding.

---

## Before you start

You need:

- A Telnyx account with a phone number already purchased
- cPanel access to your hosting
- Your domain working with **https** (the padlock in the browser)

**About https:** browser calling will not work without it. If your site shows "Not secure",
go to cPanel → **SSL/TLS Status** (or **Let's Encrypt**) and turn on the free certificate.
Do this first.

---

## Step 1 — Upload the files

1. Log into cPanel → **File Manager**
2. Open `public_html`
3. Create a folder called `dialer`
4. Open it, click **Upload**, and upload `dialer.zip`
5. Back in File Manager, right-click the zip → **Extract**
6. Delete the zip file

You should now see `index.php`, `config.php`, and folders named `api`, `assets`, `includes`, `data`.

**If the files extracted into an extra nested folder** (e.g. `dialer/dialer/index.php`),
move everything up one level so `index.php` sits directly inside `dialer`.

---

## Step 2 — Set folder permissions

The app needs to write its database.

1. In File Manager, right-click the **`data`** folder
2. Click **Change Permissions**
3. Set it to **755** (tick: Read+Write+Execute for owner, Read+Execute for the other two)
4. Save

---

## Step 3 — Collect your Telnyx details

Open [portal.telnyx.com](https://portal.telnyx.com) in another tab. You need five things.

### A. API Key and Public Key
Go to **Account Settings → API Keys** (sometimes just "API Keys" in the sidebar).
- Copy the **API key** — starts with `KEY`
- Copy the **Public Key** on the same page — a shorter string ending in `=`

If you have no key yet, click **Create API Key** first.

### B. Your phone number
**Numbers → My Numbers.** Write it in this exact format: `+12125551234`
(plus sign, country code, no spaces or dashes.)

### C. Messaging Profile ID
**Messaging → Messaging Profiles.** Click your profile. The ID is a long
string of letters, numbers and dashes — copy it from the page or the browser address bar.

*No profile yet?* Click **Create profile**, name it anything, save, then assign your
number to it under **Numbers → My Numbers → click your number → Messaging**.

### D. Credential Connection (this is what makes browser calling work)
**Voice → Programmable Voice → Connections → Create → Credential Connection**

- Name: `Browser Dialer`
- Save it
- Copy the **Connection ID**, the **username**, and the **password** it shows you
- Open the connection's settings → find **Outbound** → set **Outbound Voice Profile**
  (create one if the dropdown is empty — call it `Default`, it just controls which
  countries you can dial)

Then assign your number to it: **Numbers → My Numbers → click your number → Voice →**
set the connection to `Browser Dialer`.

---

## Step 4 — Fill in config.php

In File Manager, right-click **`config.php`** → **Edit**.

Paste each value between the quote marks:

```php
define('APP_USER', 'admin');                  // pick any username
define('APP_PASS', 'YourStrongPassword123');  // pick a strong password

define('TELNYX_API_KEY', 'KEY0187...');       // from step 3A
define('TELNYX_PUBLIC_KEY', 'abc123...=');    // from step 3A

define('TELNYX_NUMBER', '+12125551234');      // from step 3B

define('MESSAGING_PROFILE_ID', '40017...');   // from step 3C

define('SIP_CONNECTION_ID', '20291...');      // from step 3D
define('SIP_USERNAME', 'browserdialer1234');  // from step 3D
define('SIP_PASSWORD', 'the-password');       // from step 3D

define('APP_URL', 'https://yourdomain.com/dialer');   // no slash at the end
```

Also set your timezone near the bottom:

```php
date_default_timezone_set('America/New_York');
```

Common values: `America/New_York`, `America/Chicago`, `America/Denver`,
`America/Los_Angeles`, `Asia/Karachi`.

**Save the file.**

---

## Step 5 — Run the setup check

Visit: **`https://yourdomain.com/dialer/check.php`**

Every row should be green. If something is red, that row tells you exactly how to fix it.

The most common problems:

| What you see | What to do |
|---|---|
| Data folder not writable | Redo step 2. If 755 fails, try 775. |
| curl or pdo_sqlite missing | cPanel → **Select PHP Version** → **Extensions** tab → tick them |
| PHP version too old | cPanel → **Select PHP Version** → choose 8.0 or newer |
| Could not reach Telnyx | Your host blocks outgoing connections. Open a support ticket asking them to allow outbound HTTPS to `api.telnyx.com` |
| Not secure / no https | Turn on the free SSL certificate in cPanel |

This page also shows your **webhook address**. Copy it — you need it next.

---

## Step 6 — Tell Telnyx where to send incoming messages

This is what makes replies from clients show up. Skip it and you can send but never receive.

Your webhook address is:

```
https://yourdomain.com/dialer/api/webhook.php
```

**For texts:**
Telnyx → **Messaging → Messaging Profiles** → click your profile →
find **Webhook URL** → paste the address → **Save**

**For calls:**
Telnyx → **Voice → Connections** → click `Browser Dialer` →
find **Webhook URL** → paste the same address → **Save**

---

## Step 7 — Sign in and test

Go to **`https://yourdomain.com/dialer/`**

Sign in with the username and password you chose in step 4.

Test in this order:

1. **Send a text to your own cell phone.** Tap the pencil icon, enter your number, type
   something, send. It should arrive within seconds and show "Delivered".
2. **Reply from your cell.** Your reply should appear in the app within about 6 seconds.
   If it never arrives, step 6 is wrong.
3. **Make a call.** Tap **Keypad**, enter your cell number, tap the green button.
   Your browser will ask for microphone permission — click **Allow**.

---

## Step 8 — Put it on your phone

**iPhone:** open the site in Safari → tap the share button → **Add to Home Screen**

**Android:** open in Chrome → menu (⋮) → **Install app** or **Add to Home screen**

It then opens fullscreen like a normal app.

---

## Step 9 — Clean up

Delete **`check.php`** from File Manager. It shows configuration details and does not
need to stay on a live site.

---

## When something goes wrong

**"Sign in again" keeps appearing**
Your host's session settings are unusual. Contact support and mention PHP sessions.

**Texts send but never arrive**
Your 10DLC campaign is probably not approved yet. Carriers silently drop unregistered
business texts. Check **Messaging → 10DLC** in Telnyx.

**Replies never show up in the app**
Step 6 is wrong, or your `APP_URL` has a typo or a trailing slash. The webhook address
must be reachable from the outside — paste it in a browser; you should see the word `ok`.

**"Phone is not connected yet"**
Step 3D is incomplete. Check that the Credential Connection exists, has an Outbound
Voice Profile attached, and that its ID, username and password are in `config.php`.

**Calls connect but nobody can hear anything**
Your browser blocked the microphone. Click the padlock in the address bar and allow
microphone access, then reload.

**Blank white page**
A PHP error. In cPanel → **Errors** (or `error_log` in File Manager) you will see the
reason. Usually a missing extension — run `check.php` again.

---

## Costs

- Telnyx number: about $1/month
- Texts: under a cent each
- Calls: about a cent a minute
- 10DLC: roughly $2–15 one-time, plus $1.50–10/month

At 12 clients a day you will spend a few dollars a month.

---

## One important note

Registering for 10DLC makes your texts traceable — it does not give you permission to
message people. If recipients have not agreed to hear from you, carriers will still
filter your messages and your number can get blocked. Keep first messages conversational,
and always honour a STOP reply.
