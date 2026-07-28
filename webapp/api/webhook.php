<?php
/**
 * Telnyx calls this URL when something happens:
 * an incoming text, a delivery receipt, a call event.
 * It is deliberately public — no login — but every request is signature-checked.
 */
require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/telnyx.php';
require_once __DIR__ . '/../includes/fcm.php';

db(); // make sure the schema/migration has run before anything below queries it

/** Which of our users owns this Telnyx number? Falls back to the admin
 *  account so an unassigned or not-yet-configured number never silently
 *  loses a message instead of just landing somewhere sensible. */
function user_id_for_number($number) {
    static $adminId = null;
    if ($number !== '') {
        $s = db()->prepare('SELECT id FROM users WHERE phone_number = ? AND active = 1 LIMIT 1');
        $s->execute([$number]);
        $id = $s->fetchColumn();
        if ($id) return (int)$id;
    }
    if ($adminId === null) {
        $adminId = (int) (db()->query("SELECT id FROM users WHERE role='admin' ORDER BY id ASC LIMIT 1")->fetchColumn() ?: 0);
    }
    return $adminId;
}

$raw = file_get_contents('php://input');
$sig = $_SERVER['HTTP_TELNYX_SIGNATURE_ED25519'] ?? '';
$ts  = $_SERVER['HTTP_TELNYX_TIMESTAMP'] ?? '';

$rejectReason = telnyx_verify_webhook_reason($raw, $sig, $ts);
if ($rejectReason !== '') {
    log_event('webhook_rejected', $rejectReason);
    http_response_code(403);
    echo 'bad signature';
    exit;
}

$evt = json_decode($raw, true);
$type = $evt['data']['event_type'] ?? '';
$p    = $evt['data']['payload'] ?? [];

try {
    switch ($type) {

        case 'message.received':
            $from = normalize_phone($p['from']['phone_number'] ?? '');
            $to   = normalize_phone($p['to'][0]['phone_number'] ?? '');
            $body = $p['text'] ?? '';
            $tid  = $p['id'] ?? null;
            $uid  = user_id_for_number($to);

            $blk = db()->prepare('SELECT blocked FROM thread_meta WHERE user_id = ? AND phone = ?');
            $blk->execute([$uid, $from]);
            if ($blk->fetchColumn()) break;   // blocked: ignore silently

            if ($from !== '') {
                db()->prepare('INSERT OR IGNORE INTO contacts (user_id, phone) VALUES (?, ?)')->execute([$uid, $from]);
                $s = db()->prepare("
                    INSERT OR IGNORE INTO messages (user_id, telnyx_id, phone, direction, body, status, read_flag)
                    VALUES (?, ?, ?, 'inbound', ?, 'received', 0)
                ");
                $s->execute([$uid, $tid, $from, $body]);
                if ($s->rowCount() > 0) {
                    $name = db()->prepare('SELECT name FROM contacts WHERE user_id = ? AND phone = ?');
                    $name->execute([$uid, $from]);
                    $display = $name->fetchColumn() ?: pretty_phone($from);
                    $snippet = function_exists('mb_substr') ? mb_substr($body, 0, 120) : substr($body, 0, 120);
                    fcm_notify_user($uid, $display, $snippet, ['type' => 'sms', 'phone' => $from]);
                }
            }
            break;

        case 'message.sent':
        case 'message.finalized':
            $tid = $p['id'] ?? '';
            $st  = $p['to'][0]['status'] ?? 'sent';
            $err = !empty($p['errors']) ? json_encode($p['errors']) : null;
            if ($tid !== '') {
                db()->prepare('UPDATE messages SET status = ?, error = ? WHERE telnyx_id = ?')
                    ->execute([$st, $err, $tid]);
            }
            break;

        case 'call.initiated':
        case 'call.answered':
        case 'call.hangup':
            $cid = $p['call_control_id'] ?? ($p['call_session_id'] ?? '');
            $dir = ($p['direction'] ?? '') === 'incoming' ? 'inbound' : 'outbound';
            $num = normalize_phone($dir === 'inbound' ? ($p['from'] ?? '') : ($p['to'] ?? ''));
            // whichever side is one of OUR numbers is the one that tells us who owns this call
            $mine = normalize_phone($dir === 'inbound' ? ($p['to'] ?? '') : ($p['from'] ?? ''));
            $uid = user_id_for_number($mine);
            $map = [
                'call.initiated' => 'ringing',
                'call.answered'  => 'answered',
                'call.hangup'    => 'completed',
            ];
            $st = $map[$type];

            $chk = db()->prepare('SELECT id FROM calls WHERE call_id = ?');
            $chk->execute([$cid]);
            if ($chk->fetchColumn()) {
                db()->prepare('UPDATE calls SET status = ? WHERE call_id = ?')->execute([$st, $cid]);
            } else {
                db()->prepare('INSERT INTO calls (user_id, call_id, phone, direction, status) VALUES (?,?,?,?,?)')
                    ->execute([$uid, $cid, $num, $dir, $st]);
            }
            break;

        case 'call.recording.saved':
            $cid = $p['call_control_id'] ?? '';
            $url = $p['recording_urls']['mp3'] ?? ($p['public_recording_urls']['mp3'] ?? '');
            if ($cid && $url) {
                db()->prepare('UPDATE calls SET recording_url = ? WHERE call_id = ?')->execute([$url, $cid]);
            }
            break;

        case 'calls.voicemail.completed':
            $from = normalize_phone($p['from'] ?? '');
            $to   = normalize_phone($p['to'] ?? '');
            $csid = $p['call_session_id'] ?? '';
            $url  = $p['recording_url'] ?? '';
            $uid  = user_id_for_number($to);
            if ($from !== '' && $url !== '') {
                db()->prepare('INSERT OR IGNORE INTO contacts (user_id, phone) VALUES (?, ?)')->execute([$uid, $from]);
                $vm = db()->prepare('INSERT OR IGNORE INTO voicemails (user_id, phone, call_session_id, recording_url) VALUES (?, ?, ?, ?)');
                $vm->execute([$uid, $from, $csid, $url]);
                if ($vm->rowCount() > 0) {
                    $name = db()->prepare('SELECT name FROM contacts WHERE user_id = ? AND phone = ?');
                    $name->execute([$uid, $from]);
                    $display = $name->fetchColumn() ?: pretty_phone($from);
                    fcm_notify_user($uid, 'New voicemail', $display, ['type' => 'voicemail', 'phone' => $from]);
                }
            }
            break;
    }
} catch (Throwable $e) {
    log_event('webhook_error', $e->getMessage());
}

// Always 200 — otherwise Telnyx retries and duplicates pile up
http_response_code(200);
echo 'ok';
