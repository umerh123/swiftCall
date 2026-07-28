<?php
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/deepgram.php';
require_login_api();
header('Content-Type: application/json');

$action = $_GET['action'] ?? 'token';

try {
    if ($action === 'token') {
        $r = deepgram_grant_token(60);
        if (!$r['ok']) throw new Exception($r['error']);
        echo json_encode(['ok' => true, 'token' => $r['token']]);
        exit;
    }

    if ($action === 'status') {
        echo json_encode(['ok' => true, 'configured' => deepgram_configured()]);
        exit;
    }

    throw new Exception('Unknown action.');

} catch (Throwable $e) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => $e->getMessage()]);
}
