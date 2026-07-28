<?php
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/db.php';
require_admin_api();
header('Content-Type: application/json');

$me = current_user();
$action = $_GET['action'] ?? 'list';

// Fields that are safe to ever send back to the browser — never the
// password hash, never the SIP password (that goes over the wire once,
// at creation/edit time, and is never echoed back after).
function public_user_fields($u) {
    return [
        'id'                => $u['id'],
        'username'          => $u['username'],
        'display_name'      => $u['display_name'],
        'phone_number'      => $u['phone_number'],
        'sip_connection_id' => $u['sip_connection_id'],
        'sip_username'      => $u['sip_username'],
        'role'              => $u['role'],
        'active'            => (int)$u['active'],
        'created_at'        => $u['created_at'],
    ];
}

try {
    if ($action === 'list') {
        $rows = db()->query('SELECT * FROM users ORDER BY created_at ASC')->fetchAll();
        echo json_encode(['ok' => true, 'users' => array_map('public_user_fields', $rows), 'me' => $me['id']]);
        exit;
    }

    if ($action === 'save') {
        $in = json_decode(file_get_contents('php://input'), true) ?: [];
        if (!check_csrf($in['csrf'] ?? '')) throw new Exception('Session expired. Refresh and try again.');

        $id           = (int)($in['id'] ?? 0);
        $username     = trim((string)($in['username'] ?? ''));
        $password     = (string)($in['password'] ?? '');
        $displayName  = trim((string)($in['display_name'] ?? '')) ?: $username;
        $phoneNumber  = trim((string)($in['phone_number'] ?? ''));
        $sipConnId    = trim((string)($in['sip_connection_id'] ?? ''));
        $sipUsername  = trim((string)($in['sip_username'] ?? ''));
        $sipPassword  = (string)($in['sip_password'] ?? '');
        $role         = ($in['role'] ?? 'agent') === 'admin' ? 'admin' : 'agent';

        if ($username === '') throw new Exception('Give this person a username.');
        if (!preg_match('/^[a-zA-Z0-9._-]{2,40}$/', $username)) {
            throw new Exception('Usernames can only use letters, numbers, dots, dashes and underscores.');
        }
        if ($phoneNumber !== '') $phoneNumber = normalize_phone($phoneNumber);

        if ($phoneNumber !== '') {
            $dupePhone = ($id === 0)
                ? db()->prepare('SELECT id FROM users WHERE phone_number = ?')
                : db()->prepare('SELECT id FROM users WHERE phone_number = ? AND id != ?');
            $dupePhone->execute($id === 0 ? [$phoneNumber] : [$phoneNumber, $id]);
            if ($dupePhone->fetchColumn()) throw new Exception('That number is already assigned to someone else.');
        }

        if ($id === 0) {
            // creating a brand new person
            if ($password === '' || strlen($password) < 6) {
                throw new Exception('Set a password of at least 6 characters for this new login.');
            }
            $dupe = db()->prepare('SELECT id FROM users WHERE username = ?');
            $dupe->execute([$username]);
            if ($dupe->fetchColumn()) throw new Exception('That username is already taken.');

            db()->prepare("
                INSERT INTO users (username, password_hash, display_name, phone_number, sip_connection_id, sip_username, sip_password, role, active)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
            ")->execute([
                $username, password_hash($password, PASSWORD_DEFAULT), $displayName,
                $phoneNumber, $sipConnId, $sipUsername, $sipPassword, $role,
            ]);
            echo json_encode(['ok' => true, 'id' => (int)db()->lastInsertId()]);
            exit;
        }

        // editing an existing person
        $existing = db()->prepare('SELECT * FROM users WHERE id = ?');
        $existing->execute([$id]);
        $row = $existing->fetch();
        if (!$row) throw new Exception('That account no longer exists.');

        if ($username !== $row['username']) {
            $dupe = db()->prepare('SELECT id FROM users WHERE username = ? AND id != ?');
            $dupe->execute([$username, $id]);
            if ($dupe->fetchColumn()) throw new Exception('That username is already taken.');
        }
        if ($row['role'] === 'admin' && $role !== 'admin') {
            $otherAdmins = db()->prepare("SELECT COUNT(*) FROM users WHERE role='admin' AND id != ? AND active = 1");
            $otherAdmins->execute([$id]);
            if ((int)$otherAdmins->fetchColumn() === 0) {
                throw new Exception('There has to be at least one admin — promote someone else first.');
            }
        }

        if ($password !== '') {
            if (strlen($password) < 6) throw new Exception('Passwords need to be at least 6 characters.');
            db()->prepare('UPDATE users SET password_hash = ? WHERE id = ?')
                ->execute([password_hash($password, PASSWORD_DEFAULT), $id]);
        }

        // an empty SIP password field means "leave it as-is", not "erase it"
        if ($sipPassword === '') $sipPassword = $row['sip_password'];

        db()->prepare("
            UPDATE users SET username = ?, display_name = ?, phone_number = ?,
                sip_connection_id = ?, sip_username = ?, sip_password = ?, role = ?
            WHERE id = ?
        ")->execute([$username, $displayName, $phoneNumber, $sipConnId, $sipUsername, $sipPassword, $role, $id]);

        echo json_encode(['ok' => true]);
        exit;
    }

    if ($action === 'set_active') {
        $in = json_decode(file_get_contents('php://input'), true) ?: [];
        if (!check_csrf($in['csrf'] ?? '')) throw new Exception('Session expired. Refresh and try again.');
        $id = (int)($in['id'] ?? 0);
        $active = !empty($in['active']) ? 1 : 0;

        if ($id === $me['id'] && $active === 0) throw new Exception('You cannot deactivate your own account.');

        if ($active === 0) {
            $row = db()->prepare('SELECT role FROM users WHERE id = ?');
            $row->execute([$id]);
            if ($row->fetchColumn() === 'admin') {
                $otherAdmins = db()->prepare("SELECT COUNT(*) FROM users WHERE role='admin' AND id != ? AND active = 1");
                $otherAdmins->execute([$id]);
                if ((int)$otherAdmins->fetchColumn() === 0) {
                    throw new Exception('There has to be at least one active admin.');
                }
            }
        }

        db()->prepare('UPDATE users SET active = ? WHERE id = ?')->execute([$active, $id]);
        echo json_encode(['ok' => true]);
        exit;
    }

    throw new Exception('Unknown action.');

} catch (Throwable $e) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => $e->getMessage()]);
}
