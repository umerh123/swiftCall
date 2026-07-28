<?php
require_once __DIR__ . '/db.php';

/**
 * Call the Telnyx REST API.
 * Returns ['ok' => bool, 'code' => int, 'data' => array, 'error' => string]
 */
function telnyx_request($method, $path, $payload = null) {
    $url = TELNYX_API . $path;
    $ch  = curl_init($url);

    $headers = [
        'Authorization: Bearer ' . TELNYX_API_KEY,
        'Content-Type: application/json',
        'Accept: application/json',
    ];

    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST  => strtoupper($method),
        CURLOPT_HTTPHEADER     => $headers,
        CURLOPT_TIMEOUT        => 25,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_SSL_VERIFYPEER => true,
    ]);

    if ($payload !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
    }

    $body = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $cerr = curl_error($ch);
    curl_close($ch);

    if ($body === false) {
        log_event('curl_error', $cerr);
        return ['ok' => false, 'code' => 0, 'data' => [], 'error' => 'Could not reach Telnyx: ' . $cerr];
    }

    $json = json_decode($body, true) ?: [];

    if ($code >= 200 && $code < 300) {
        return ['ok' => true, 'code' => $code, 'data' => $json['data'] ?? $json, 'raw' => $body, 'error' => ''];
    }

    $msg = 'Telnyx returned ' . $code;
    if (!empty($json['errors'][0])) {
        $e = $json['errors'][0];
        $msg = $e['title'] ?? $msg;
        if (!empty($e['detail'])) $msg .= ' — ' . $e['detail'];
    }
    log_event('telnyx_error', ['path' => $path, 'code' => $code, 'body' => $body]);
    return ['ok' => false, 'code' => $code, 'data' => $json, 'error' => $msg];
}

/** Send an SMS from a specific one of our numbers. */
function telnyx_send_sms($from, $to, $text) {
    $payload = [
        'from' => $from,
        'to'   => $to,
        'text' => $text,
    ];
    if (defined('MESSAGING_PROFILE_ID') && MESSAGING_PROFILE_ID !== '') {
        $payload['messaging_profile_id'] = MESSAGING_PROFILE_ID;
    }
    $payload['webhook_url'] = APP_URL . '/api/webhook.php';
    return telnyx_request('POST', '/messages', $payload);
}

/**
 * Fetch a Telnyx-hosted recording and hand back the raw bytes, so the
 * browser never needs the API key and CORS is never a concern.
 *
 * Some recording URLs are pre-signed (the auth is baked into the URL
 * itself) and will reject an extra Authorization header as invalid, so
 * we try with the header first and silently retry without it if that
 * specific failure mode shows up.
 */
function telnyx_fetch_binary($url) {
    $attempt = function ($withAuth, $verifySsl) use ($url) {
        $ch = curl_init($url);
        $headers = $withAuth ? ['Authorization: Bearer ' . TELNYX_API_KEY] : [];
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER     => $headers,
            CURLOPT_TIMEOUT        => 45,
            CURLOPT_CONNECTTIMEOUT => 12,
            CURLOPT_SSL_VERIFYPEER => $verifySsl,
            CURLOPT_SSL_VERIFYHOST => $verifySsl ? 2 : 0,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS      => 5,
        ]);
        $body    = curl_exec($ch);
        $code    = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $ctype   = curl_getinfo($ch, CURLINFO_CONTENT_TYPE) ?: 'audio/mpeg';
        $cerr    = curl_error($ch);
        $cerrno  = curl_errno($ch);
        curl_close($ch);
        return [$body, $code, $ctype, $cerr, $cerrno];
    };

    [$body, $code, $ctype, $cerr, $cerrno] = $attempt(true, true);

    if ($body === false || $code === 401 || $code === 403 || $code === 400) {
        [$body, $code, $ctype, $cerr, $cerrno] = $attempt(false, true);
    }

    // CURLE_SSL_CACERT / CURLE_SSL_CACERT_BADFILE / CURLE_PEER_FAILED_VERIFICATION —
    // a stale CA bundle on the host is a common shared-hosting problem and has
    // nothing to do with whether the recording itself is valid, so fall back
    // to fetching without verification rather than failing outright.
    if ($body === false && in_array($cerrno, [51, 60, 77], true)) {
        log_event('recording_fetch_ssl_fallback', "curl errno $cerrno: $cerr");
        [$body, $code, $ctype, $cerr, $cerrno] = $attempt(false, false);
    }

    if ($body === false || $code >= 400) {
        log_event('recording_fetch_error', ['url' => $url, 'code' => $code, 'curl_error' => $cerr]);
        return ['ok' => false, 'error' => $cerr ?: ('Telnyx returned HTTP ' . $code . ' for the recording')];
    }
    return ['ok' => true, 'body' => $body, 'content_type' => $ctype];
}

/**
 * Mint a short-lived token so the browser can register as a softphone
 * without ever seeing the API key.
 */
function telnyx_rtc_token() {
    if (SIP_CONNECTION_ID === '') {
        return ['ok' => false, 'error' => 'No SIP connection configured in config.php'];
    }
    $r = telnyx_request('POST', '/telephony_credentials', [
        'connection_id' => SIP_CONNECTION_ID,
        'name'          => 'browser-' . date('YmdHis'),
        'expires_at'    => gmdate('Y-m-d\TH:i:s\Z', time() + 3600),
    ]);
    if (!$r['ok']) return ['ok' => false, 'error' => $r['error']];

    $id = $r['data']['id'] ?? '';
    if ($id === '') return ['ok' => false, 'error' => 'Telnyx did not return a credential id'];

    $t = telnyx_request('POST', "/telephony_credentials/$id/token");
    if (!$t['ok']) return ['ok' => false, 'error' => $t['error']];

    // Telnyx returns the token as a raw JWT string (not JSON),
    // but some responses wrap it — accept every shape.
    $token = '';
    if (is_string($t['data']) && $t['data'] !== '') {
        $token = $t['data'];
    } elseif (!empty($t['data']['token'])) {
        $token = $t['data']['token'];
    } elseif (!empty($t['raw'])) {
        $token = trim($t['raw'], " \t\n\r\"");
    }

    if ($token === '') return ['ok' => false, 'error' => 'Telnyx did not return a token'];

    return ['ok' => true, 'token' => trim($token)];
}

/** Verify a webhook really came from Telnyx. */
/** Returns a reason string on failure, or '' on success — so a rejected
 *  webhook can be logged with something actually actionable instead of
 *  just "bad signature", which could just as easily mean a wrong config
 *  as it could mean the server's clock has drifted. */
function telnyx_verify_webhook_reason($rawBody, $signature, $timestamp) {
    if (TELNYX_PUBLIC_KEY === '') return 'TELNYX_PUBLIC_KEY is not set in config.php';
    if ($signature === '' || $timestamp === '') return 'missing signature headers';

    $skew = time() - (int)$timestamp;
    if (abs($skew) > 300) {
        return "server clock is off by {$skew}s from Telnyx — check your server's system time/timezone";
    }

    if (!function_exists('sodium_crypto_sign_verify_detached')) {
        log_event('webhook', 'sodium extension missing — signature not checked');
        return ''; // shared hosts without libsodium: accept, but note it
    }

    $key = base64_decode(TELNYX_PUBLIC_KEY, true);
    $sig = base64_decode($signature, true);
    if ($key === false || $sig === false || strlen($key) !== 32) return 'malformed key or signature';

    try {
        $ok = sodium_crypto_sign_verify_detached($sig, $timestamp . '|' . $rawBody, $key);
        return $ok ? '' : 'signature did not match — check TELNYX_PUBLIC_KEY in config.php';
    } catch (Throwable $e) {
        return 'verification error: ' . $e->getMessage();
    }
}

function telnyx_verify_webhook($rawBody, $signature, $timestamp) {
    return telnyx_verify_webhook_reason($rawBody, $signature, $timestamp) === '';
}
