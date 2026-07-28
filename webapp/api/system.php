<?php
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/db.php';
require_admin_api();

$action = $_GET['action'] ?? 'logs';

try {
    if ($action === 'logs') {
        header('Content-Type: application/json');
        $rows = db()->query('SELECT kind, detail, created_at FROM logs ORDER BY id DESC LIMIT 60')->fetchAll();
        echo json_encode(['ok' => true, 'logs' => $rows]);
        exit;
    }

    if ($action === 'backup') {
        // Force everything sitting in the WAL file into the main database
        // file first, so the file we hand back is actually complete —
        // otherwise very recent writes could be missing from a plain copy.
        db()->exec('PRAGMA wal_checkpoint(FULL)');

        $path = DB_PATH;
        if (!is_readable($path)) {
            http_response_code(500);
            echo 'Could not read the database file.';
            exit;
        }

        $stamp = date('Y-m-d_His');
        header('Content-Type: application/octet-stream');
        header('Content-Disposition: attachment; filename="dialer-backup-' . $stamp . '.sqlite"');
        header('Content-Length: ' . filesize($path));
        header('Cache-Control: private, no-store');
        readfile($path);
        exit;
    }

    header('Content-Type: application/json');
    throw new Exception('Unknown action.');

} catch (Throwable $e) {
    http_response_code(400);
    header('Content-Type: application/json');
    echo json_encode(['ok' => false, 'error' => $e->getMessage()]);
}
