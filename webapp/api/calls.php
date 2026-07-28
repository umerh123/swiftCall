<?php
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/telnyx.php';
require_login_api();
header('Content-Type: application/json');

$me  = current_user();
$uid = $me['id'];
$action = $_GET['action'] ?? 'history';

try {
    if ($action === 'token') {
        // Register with THIS user's own SIP credentials so that inbound
        // calls to their number ring their browser specifically, not
        // anyone else's. (On-demand tokens register a separate SIP
        // identity that inbound routing does not target.)
        $sipUser = $me['sip_username'] ?? '';
        $sipPass = $me['sip_password'] ?? '';
        if ($sipUser === '' || $sipPass === '') {
            echo json_encode(['ok' => false, 'error' => 'Your account has no calling line set up yet — ask an admin to configure one.']);
            exit;
        }
        echo json_encode(['ok' => true, 'login' => $sipUser, 'password' => $sipPass]);
        exit;
    }

    if ($action === 'history') {
        $s = db()->prepare("
            SELECT c.*, ct.name
            FROM calls c
            LEFT JOIN contacts ct ON ct.user_id = c.user_id AND ct.phone = c.phone
            WHERE c.user_id = ?
            ORDER BY c.id DESC LIMIT 100
        ");
        $s->execute([$uid]);
        $rows = $s->fetchAll();
        foreach ($rows as &$r) $r['display'] = $r['name'] ?: pretty_phone($r['phone']);
        echo json_encode(['ok' => true, 'calls' => $rows]);
        exit;
    }

    if ($action === 'log') {
        $in    = json_decode(file_get_contents('php://input'), true) ?: [];
        $phone = normalize_phone($in['phone'] ?? '');
        $dur   = (int)($in['duration'] ?? 0);
        $dir   = ($in['direction'] ?? 'outbound') === 'inbound' ? 'inbound' : 'outbound';
        $st    = $in['status'] ?? 'completed';
        if ($phone !== '') {
            db()->prepare('INSERT OR IGNORE INTO contacts (user_id, phone) VALUES (?, ?)')->execute([$uid, $phone]);
            db()->prepare('INSERT INTO calls (user_id, call_id, phone, direction, status, duration) VALUES (?,?,?,?,?,?)')
                ->execute([$uid, 'rtc-' . bin2hex(random_bytes(6)), $phone, $dir, $st, $dur]);
        }
        echo json_encode(['ok' => true]);
        exit;
    }

    throw new Exception('Unknown action.');

} catch (Throwable $e) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => $e->getMessage()]);
}
