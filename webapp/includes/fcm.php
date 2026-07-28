<?php
/**
 * Sends push notifications through Firebase Cloud Messaging's HTTP v1 API.
 *
 * This only needs a handful of primitives PHP already has built in
 * (openssl, curl) — no Composer/Google SDK required, which matters because
 * this app is meant to run on plain shared hosting with no package manager.
 *
 * Setup: Firebase console → Project settings → Service accounts →
 * "Generate new private key". Save that JSON file as
 * data/fcm-service-account.json (outside the web root's reach — data/ is
 * already blocked by .htaccess).
 */

function fcm_service_account() {
    static $sa = false;
    if ($sa !== false) return $sa;
    $path = defined('FCM_SERVICE_ACCOUNT_PATH') ? FCM_SERVICE_ACCOUNT_PATH : '';
    if ($path === '' || !is_readable($path)) { $sa = null; return null; }
    $json = json_decode(file_get_contents($path), true);
    if (empty($json['client_email']) || empty($json['private_key']) || empty($json['project_id'])) {
        $sa = null; return null;
    }
    $sa = $json;
    return $sa;
}

function fcm_base64url($data) {
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

/** Mints a short-lived OAuth2 access token from the service account,
 *  caching it on disk for the rest of its lifetime. */
function fcm_access_token() {
    $sa = fcm_service_account();
    if (!$sa) return ['ok' => false, 'error' => 'FCM service account is not configured (data/fcm-service-account.json missing).'];

    $cachePath = dirname(DB_PATH) . '/fcm_token_cache.json';
    if (is_readable($cachePath)) {
        $cached = json_decode(file_get_contents($cachePath), true);
        if (!empty($cached['token']) && !empty($cached['expires_at']) && $cached['expires_at'] > time() + 60) {
            return ['ok' => true, 'token' => $cached['token']];
        }
    }

    $now = time();
    $header = fcm_base64url(json_encode(['alg' => 'RS256', 'typ' => 'JWT']));
    $claims = fcm_base64url(json_encode([
        'iss'   => $sa['client_email'],
        'scope' => 'https://www.googleapis.com/auth/firebase.messaging',
        'aud'   => $sa['token_uri'] ?? 'https://oauth2.googleapis.com/token',
        'iat'   => $now,
        'exp'   => $now + 3600,
    ]));
    $unsigned = $header . '.' . $claims;

    $signature = '';
    $ok = openssl_sign($unsigned, $signature, $sa['private_key'], 'SHA256');
    if (!$ok) return ['ok' => false, 'error' => 'Could not sign the FCM service account key.'];
    $jwt = $unsigned . '.' . fcm_base64url($signature);

    $ch = curl_init($sa['token_uri'] ?? 'https://oauth2.googleapis.com/token');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => http_build_query([
            'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            'assertion'  => $jwt,
        ]),
        CURLOPT_TIMEOUT        => 15,
        CURLOPT_CONNECTTIMEOUT => 10,
    ]);
    $body = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    $data = json_decode($body ?: '', true) ?: [];
    if ($code < 200 || $code >= 300 || empty($data['access_token'])) {
        log_event('fcm_token_error', ['code' => $code, 'body' => $body]);
        return ['ok' => false, 'error' => 'Could not get an FCM access token (HTTP ' . $code . ').'];
    }

    @file_put_contents($cachePath, json_encode([
        'token'      => $data['access_token'],
        'expires_at' => $now + (int)($data['expires_in'] ?? 3000),
    ]));

    return ['ok' => true, 'token' => $data['access_token']];
}

/**
 * Sends one push to one device. $notification = ['title' => ..., 'body' => ...]
 * (shown even if the app is fully closed); $data = flat string=>string map
 * the app can read to decide what to do (e.g. open a specific thread).
 * Returns false for "unregistered" tokens so the caller can prune them.
 */
function fcm_send($deviceToken, $notification, $data = []) {
    $sa = fcm_service_account();
    if (!$sa) return ['ok' => false, 'error' => 'FCM not configured', 'unregistered' => false];

    $auth = fcm_access_token();
    if (!$auth['ok']) return ['ok' => false, 'error' => $auth['error'], 'unregistered' => false];

    $strData = [];
    foreach ($data as $k => $v) $strData[$k] = (string)$v;

    $payload = [
        'message' => [
            'token'        => $deviceToken,
            'notification' => $notification,
            'data'         => $strData,
            'android'      => [
                'priority' => 'high',
                'notification' => [
                    'channel_id' => 'messages',
                    'sound'      => 'default',
                ],
            ],
        ],
    ];

    $url = 'https://fcm.googleapis.com/v1/projects/' . $sa['project_id'] . '/messages:send';
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_HTTPHEADER     => [
            'Authorization: Bearer ' . $auth['token'],
            'Content-Type: application/json',
        ],
        CURLOPT_POSTFIELDS     => json_encode($payload),
        CURLOPT_TIMEOUT        => 15,
        CURLOPT_CONNECTTIMEOUT => 10,
    ]);
    $body = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($code >= 200 && $code < 300) return ['ok' => true, 'unregistered' => false];

    $err = json_decode($body ?: '', true);
    $status = $err['error']['status'] ?? '';
    $unregistered = in_array($status, ['UNREGISTERED', 'NOT_FOUND', 'INVALID_ARGUMENT'], true);
    log_event('fcm_send_error', ['code' => $code, 'body' => $body]);
    return ['ok' => false, 'error' => 'FCM returned HTTP ' . $code, 'unregistered' => $unregistered];
}

/** Pushes a notification to every device the given user has registered,
 *  quietly forgetting any token FCM says is no longer valid. */
function fcm_notify_user($userId, $title, $body, $data = []) {
    $rows = db()->prepare('SELECT fcm_token FROM device_push_tokens WHERE user_id = ?');
    $rows->execute([$userId]);
    foreach ($rows->fetchAll() as $row) {
        $r = fcm_send($row['fcm_token'], ['title' => $title, 'body' => $body], $data);
        if (!$r['ok'] && $r['unregistered']) {
            db()->prepare('DELETE FROM device_push_tokens WHERE fcm_token = ?')->execute([$row['fcm_token']]);
        }
    }
}
