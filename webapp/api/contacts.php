<?php
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/db.php';
require_login_api();
header('Content-Type: application/json');

$uid = current_user()['id'];
$action = $_GET['action'] ?? 'list';

try {
    if ($action === 'list') {
        $s = db()->prepare('SELECT * FROM contacts WHERE user_id = ? ORDER BY COALESCE(NULLIF(name,""), phone) COLLATE NOCASE ASC');
        $s->execute([$uid]);
        $rows = $s->fetchAll();
        foreach ($rows as &$r) $r['display'] = $r['name'] ?: pretty_phone($r['phone']);
        echo json_encode(['ok' => true, 'contacts' => $rows]);
        exit;
    }

    if ($action === 'save') {
        $in = json_decode(file_get_contents('php://input'), true) ?: [];
        if (!check_csrf($in['csrf'] ?? '')) throw new Exception('Session expired. Refresh and try again.');

        $phone = normalize_phone($in['phone'] ?? '');
        $name  = trim((string)($in['name'] ?? ''));
        $notes = trim((string)($in['notes'] ?? ''));
        if ($phone === '' || strlen($phone) < 8) throw new Exception('That phone number does not look right.');

        db()->prepare('INSERT OR IGNORE INTO contacts (user_id, phone) VALUES (?, ?)')->execute([$uid, $phone]);
        db()->prepare('UPDATE contacts SET name = ?, notes = ? WHERE user_id = ? AND phone = ?')->execute([$name, $notes, $uid, $phone]);

        echo json_encode(['ok' => true, 'phone' => $phone]);
        exit;
    }

    if ($action === 'delete') {
        $in = json_decode(file_get_contents('php://input'), true) ?: [];
        if (!check_csrf($in['csrf'] ?? '')) throw new Exception('Session expired. Refresh and try again.');
        $phone = normalize_phone($in['phone'] ?? '');
        db()->prepare('DELETE FROM contacts WHERE user_id = ? AND phone = ?')->execute([$uid, $phone]);
        echo json_encode(['ok' => true]);
        exit;
    }

    throw new Exception('Unknown action.');

} catch (Throwable $e) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => $e->getMessage()]);
}
