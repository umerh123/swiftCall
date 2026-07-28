<?php
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/telnyx.php';
require_login_api();
header('Content-Type: application/json');

$me = current_user();
$uid = $me['id'];
$myNumber = $me['phone_number'] ?? '';

$in    = json_decode(file_get_contents('php://input'), true) ?: [];
$to    = normalize_phone($in['to'] ?? '');
$text  = trim((string)($in['text'] ?? ''));
$token = $in['csrf'] ?? '';

if (!check_csrf($token)) {
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => 'Session expired. Refresh the page and try again.']);
    exit;
}
if ($myNumber === '' || $myNumber === '+1') {
    echo json_encode(['ok' => false, 'error' => 'Your account has no phone number assigned yet — ask an admin to set one up.']);
    exit;
}
if ($to === '' || strlen($to) < 8) {
    echo json_encode(['ok' => false, 'error' => 'That phone number does not look right.']);
    exit;
}
if ($text === '') {
    echo json_encode(['ok' => false, 'error' => 'Type a message first.']);
    exit;
}
$len = function_exists('mb_strlen') ? mb_strlen($text) : strlen($text);
if ($len > 1600) {
    echo json_encode(['ok' => false, 'error' => 'Message is too long. Keep it under 1600 characters.']);
    exit;
}

// Save it immediately so it shows in the thread even if Telnyx is slow
$s = db()->prepare("INSERT INTO messages (user_id, phone, direction, body, status, read_flag) VALUES (?, ?, 'outbound', ?, 'sending', 1)");
$s->execute([$uid, $to, $text]);
$localId = (int)db()->lastInsertId();

db()->prepare('INSERT OR IGNORE INTO contacts (user_id, phone) VALUES (?, ?)')->execute([$uid, $to]);

$r = telnyx_send_sms($myNumber, $to, $text);

// Retry once, but only for failures that are actually worth retrying —
// a network blip or a Telnyx-side hiccup, not a permanent problem like an
// invalid number or an empty account balance, where trying again would
// only delay showing the real reason it failed.
if (!$r['ok'] && ($r['code'] === 0 || $r['code'] >= 500)) {
    usleep(700000);
    $r = telnyx_send_sms($myNumber, $to, $text);
}

if ($r['ok']) {
    $tid = $r['data']['id'] ?? null;
    db()->prepare('UPDATE messages SET telnyx_id = ?, status = ? WHERE id = ?')
        ->execute([$tid, 'sent', $localId]);
    echo json_encode(['ok' => true, 'id' => $localId, 'status' => 'sent']);
} else {
    db()->prepare('UPDATE messages SET status = ?, error = ? WHERE id = ?')
        ->execute(['failed', $r['error'], $localId]);
    echo json_encode(['ok' => false, 'id' => $localId, 'error' => $r['error']]);
}
