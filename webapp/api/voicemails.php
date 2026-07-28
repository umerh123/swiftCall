<?php
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/telnyx.php';

// The mobile app's native audio player fetches ?action=audio directly and
// can't attach an Authorization header, so — for this one read-only action
// only — a token in the query string is accepted too.
if (($_GET['action'] ?? '') === 'audio' && empty($_SERVER['HTTP_AUTHORIZATION']) && !empty($_GET['token'])) {
    $_SERVER['HTTP_AUTHORIZATION'] = 'Bearer ' . $_GET['token'];
}

require_login_api();

$uid = current_user()['id'];
$action = $_GET['action'] ?? 'list';

try {
    if ($action === 'list') {
        header('Content-Type: application/json');
        $s = db()->prepare("
            SELECT v.*, c.name
            FROM voicemails v
            LEFT JOIN contacts c ON c.user_id = v.user_id AND c.phone = v.phone
            WHERE v.user_id = ?
            ORDER BY v.id DESC
        ");
        $s->execute([$uid]);
        $rows = $s->fetchAll();
        foreach ($rows as &$r) $r['display'] = $r['name'] ?: pretty_phone($r['phone']);
        echo json_encode(['ok' => true, 'voicemails' => $rows]);
        exit;
    }

    if ($action === 'mark_read') {
        header('Content-Type: application/json');
        $in = json_decode(file_get_contents('php://input'), true) ?: [];
        if (!check_csrf($in['csrf'] ?? '')) throw new Exception('Session expired. Refresh and try again.');
        $id = (int)($in['id'] ?? 0);
        db()->prepare('UPDATE voicemails SET listened = 1 WHERE id = ? AND user_id = ?')->execute([$id, $uid]);
        echo json_encode(['ok' => true]);
        exit;
    }

    if ($action === 'delete') {
        header('Content-Type: application/json');
        $in = json_decode(file_get_contents('php://input'), true) ?: [];
        if (!check_csrf($in['csrf'] ?? '')) throw new Exception('Session expired. Refresh and try again.');
        $id = (int)($in['id'] ?? 0);
        db()->prepare('DELETE FROM voicemails WHERE id = ? AND user_id = ?')->execute([$id, $uid]);
        echo json_encode(['ok' => true]);
        exit;
    }

    if ($action === 'audio') {
        // Streams the actual recording bytes through our own server, so the
        // browser never sees the Telnyx API key and there's no CORS issue.
        $id = (int)($_GET['id'] ?? 0);
        $s = db()->prepare('SELECT recording_url FROM voicemails WHERE id = ? AND user_id = ?');
        $s->execute([$id, $uid]);
        $url = $s->fetchColumn();
        if (!$url) {
            http_response_code(404);
            header('Content-Type: text/plain');
            echo 'No recording found for that voicemail.';
            exit;
        }

        $r = telnyx_fetch_binary($url);
        if (!$r['ok']) {
            http_response_code(502);
            header('Content-Type: text/plain');
            echo 'Could not fetch the recording from Telnyx: ' . $r['error'];
            exit;
        }

        header('Content-Type: ' . $r['content_type']);
        header('Content-Length: ' . strlen($r['body']));
        header('Cache-Control: private, max-age=3600');
        echo $r['body'];
        exit;
    }

    header('Content-Type: application/json');
    throw new Exception('Unknown action.');

} catch (Throwable $e) {
    http_response_code(400);
    header('Content-Type: application/json');
    echo json_encode(['ok' => false, 'error' => $e->getMessage()]);
}
