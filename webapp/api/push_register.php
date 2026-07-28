<?php
/**
 * Registers/unregisters this device's FCM token so api/webhook.php can
 * push a notification to it when an SMS arrives. (Incoming *calls* don't
 * go through here — Telnyx pushes those directly once the Android push
 * credential is configured in the Telnyx portal.)
 */
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/db.php';
require_login_api();
header('Content-Type: application/json');

$uid = current_user()['id'];
$in = json_decode(file_get_contents('php://input'), true) ?: [];
$action = $in['action'] ?? ($_GET['action'] ?? 'register');
$fcmToken = trim((string)($in['fcm_token'] ?? ''));

try {
    if ($action === 'register') {
        if ($fcmToken === '') throw new Exception('No push token given.');
        // A token belongs to one device; if it was previously registered to
        // a different account (phone re-used, different login), move it.
        db()->prepare('DELETE FROM device_push_tokens WHERE fcm_token = ? AND user_id != ?')->execute([$fcmToken, $uid]);
        db()->prepare("
            INSERT INTO device_push_tokens (user_id, fcm_token, platform, last_seen_at)
            VALUES (?, ?, 'android', datetime('now'))
            ON CONFLICT(fcm_token) DO UPDATE SET last_seen_at = datetime('now')
        ")->execute([$uid, $fcmToken]);
        echo json_encode(['ok' => true]);
        exit;
    }

    if ($action === 'unregister') {
        if ($fcmToken === '') throw new Exception('No push token given.');
        db()->prepare('DELETE FROM device_push_tokens WHERE fcm_token = ? AND user_id = ?')->execute([$fcmToken, $uid]);
        echo json_encode(['ok' => true]);
        exit;
    }

    throw new Exception('Unknown action.');

} catch (Throwable $e) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => $e->getMessage()]);
}
