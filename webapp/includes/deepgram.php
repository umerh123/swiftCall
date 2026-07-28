<?php
/**
 * Live call transcription (Deepgram).
 * We never send the permanent API key to the browser — instead we mint a
 * short-lived grant token server-side (valid only long enough to open the
 * WebSocket) and hand that to the browser instead. Same pattern already
 * used for the Telnyx WebRTC softphone token.
 */

function deepgram_configured() {
    return defined('DEEPGRAM_API_KEY') && DEEPGRAM_API_KEY !== '';
}

function deepgram_grant_token($ttlSeconds = 60) {
    if (!deepgram_configured()) {
        return ['ok' => false, 'error' => 'Live transcription is not set up. Add DEEPGRAM_API_KEY in config.php.'];
    }

    $ch = curl_init('https://api.deepgram.com/v1/auth/grant');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => json_encode(['ttl_seconds' => $ttlSeconds]),
        CURLOPT_HTTPHEADER     => [
            'Authorization: Token ' . DEEPGRAM_API_KEY,
            'Content-Type: application/json',
        ],
        CURLOPT_TIMEOUT        => 15,
        CURLOPT_CONNECTTIMEOUT => 8,
        CURLOPT_SSL_VERIFYPEER => true,
    ]);
    $body = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $cerr = curl_error($ch);
    curl_close($ch);

    if ($body === false) {
        return ['ok' => false, 'error' => 'Could not reach Deepgram: ' . $cerr];
    }

    $json = json_decode($body, true) ?: [];

    if ($code < 200 || $code >= 300) {
        $msg = $json['err_msg'] ?? $json['message'] ?? ('Deepgram returned ' . $code);
        return ['ok' => false, 'error' => $msg];
    }

    $token = $json['access_token'] ?? $json['token'] ?? '';
    if ($token === '') {
        return ['ok' => false, 'error' => 'Deepgram did not return a token'];
    }

    return ['ok' => true, 'token' => $token];
}
