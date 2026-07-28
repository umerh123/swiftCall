<?php
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/db.php';
require_login_api();
header('Content-Type: application/json');

$uid = current_user()['id'];
$action = $_GET['action'] ?? 'threads';

try {
    if ($action === 'threads') {
        $s = db()->prepare("
            SELECT m.phone,
                   c.name,
                   m.body      AS last_body,
                   m.direction AS last_direction,
                   m.created_at AS last_at,
                   (SELECT COUNT(*) FROM messages u
                     WHERE u.user_id = ? AND u.phone = m.phone AND u.direction='inbound' AND u.read_flag=0) AS unread
            FROM messages m
            JOIN (SELECT phone, MAX(id) AS mid FROM messages WHERE user_id = ? GROUP BY phone) t
              ON m.id = t.mid
            LEFT JOIN contacts c ON c.user_id = m.user_id AND c.phone = m.phone
            LEFT JOIN thread_meta tm ON tm.user_id = m.user_id AND tm.phone = m.phone
            WHERE m.user_id = ? AND COALESCE(tm.archived,0) = 0
            ORDER BY m.id DESC
        ");
        $s->execute([$uid, $uid, $uid]);
        $rows = $s->fetchAll();

        foreach ($rows as &$r) $r['display'] = $r['name'] ?: pretty_phone($r['phone']);
        echo json_encode(['ok' => true, 'threads' => $rows]);
        exit;
    }

    if ($action === 'thread') {
        $phone = normalize_phone($_GET['phone'] ?? '');
        if ($phone === '') throw new Exception('No phone number given.');

        $s = db()->prepare('SELECT * FROM messages WHERE user_id = ? AND phone = ? ORDER BY id ASC');
        $s->execute([$uid, $phone]);
        $msgs = $s->fetchAll();

        $u = db()->prepare("UPDATE messages SET read_flag=1 WHERE user_id=? AND phone=? AND direction='inbound'");
        $u->execute([$uid, $phone]);

        $c = db()->prepare('SELECT name FROM contacts WHERE user_id = ? AND phone = ?');
        $c->execute([$uid, $phone]);
        $name = $c->fetchColumn() ?: '';

        echo json_encode([
            'ok'       => true,
            'phone'    => $phone,
            'display'  => $name ?: pretty_phone($phone),
            'name'     => $name,
            'messages' => $msgs,
        ]);
        exit;
    }

    if ($action === 'since') {
        // Cheap polling: has anything changed?
        $lastId = (int)($_GET['last_id'] ?? 0);
        $s = db()->prepare('SELECT COUNT(*) FROM messages WHERE user_id = ? AND id > ?');
        $s->execute([$uid, $lastId]);
        $newCount = (int)$s->fetchColumn();
        $m = db()->prepare('SELECT COALESCE(MAX(id),0) FROM messages WHERE user_id = ?');
        $m->execute([$uid]);
        $maxId = (int)$m->fetchColumn();
        echo json_encode(['ok' => true, 'new' => $newCount, 'max_id' => $maxId]);
        exit;
    }

    if (in_array($action, ['archive','block','delete_thread','unblock'], true)) {
        $in = json_decode(file_get_contents('php://input'), true) ?: [];
        if (!check_csrf($in['csrf'] ?? '')) throw new Exception('Session expired. Refresh and try again.');
        $phone = normalize_phone($in['phone'] ?? '');
        if ($phone === '') throw new Exception('No phone number given.');

        db()->prepare('INSERT OR IGNORE INTO thread_meta (user_id, phone) VALUES (?, ?)')->execute([$uid, $phone]);

        if ($action === 'archive') {
            db()->prepare('UPDATE thread_meta SET archived = 1 WHERE user_id = ? AND phone = ?')->execute([$uid, $phone]);
        } elseif ($action === 'block') {
            db()->prepare('UPDATE thread_meta SET blocked = 1, archived = 1 WHERE user_id = ? AND phone = ?')->execute([$uid, $phone]);
        } elseif ($action === 'unblock') {
            db()->prepare('UPDATE thread_meta SET blocked = 0, archived = 0 WHERE user_id = ? AND phone = ?')->execute([$uid, $phone]);
        } else { // delete_thread
            db()->prepare('DELETE FROM messages WHERE user_id = ? AND phone = ?')->execute([$uid, $phone]);
            db()->prepare('DELETE FROM thread_meta WHERE user_id = ? AND phone = ?')->execute([$uid, $phone]);
        }
        echo json_encode(['ok' => true]);
        exit;
    }

    throw new Exception('Unknown action.');

} catch (Throwable $e) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => $e->getMessage()]);
}
