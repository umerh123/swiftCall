<?php
/**
 * Login for the mobile app. Unlike the web app, the mobile app can't rely
 * on a browser cookie jar, so this hands back a long-lived bearer token
 * instead of starting a PHP session. Everything else about "who is this
 * user" (require_login_api, current_user, etc.) already understands both.
 */
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/db.php';
header('Content-Type: application/json');

$action = $_GET['action'] ?? ($_POST['action'] ?? 'login');

function recent_failed_logins_mobile($ip) {
    $s = db()->prepare("SELECT COUNT(*) FROM logs WHERE kind = 'mobile_login_failed' AND detail = ? AND created_at > datetime('now', '-15 minutes')");
    $s->execute([$ip]);
    return (int)$s->fetchColumn();
}

function public_profile($u) {
    return [
        'id'           => (int)$u['id'],
        'username'     => $u['username'],
        'display_name' => $u['display_name'],
        'phone_number' => $u['phone_number'],
        'role'         => $u['role'],
    ];
}

try {
    if ($action === 'login') {
        $in = json_decode(file_get_contents('php://input'), true) ?: [];
        $username = trim((string)($in['username'] ?? ''));
        $password = (string)($in['password'] ?? '');
        $deviceName = trim((string)($in['device_name'] ?? 'Android device'));
        $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';

        usleep(300000); // slow down guessing, same as the web login

        if (recent_failed_logins_mobile($ip) >= 10) {
            http_response_code(429);
            echo json_encode(['ok' => false, 'error' => 'Too many failed attempts. Try again in a few minutes.']);
            exit;
        }

        $s = db()->prepare('SELECT * FROM users WHERE username = ? AND active = 1');
        $s->execute([$username]);
        $u = $s->fetch();

        if (!$u || !password_verify($password, $u['password_hash'])) {
            log_event('mobile_login_failed', $ip);
            http_response_code(401);
            echo json_encode(['ok' => false, 'error' => 'That username or password is not right.']);
            exit;
        }

        $token = bin2hex(random_bytes(32));
        db()->prepare('INSERT INTO api_tokens (user_id, token, device_name) VALUES (?, ?, ?)')
            ->execute([$u['id'], $token, $deviceName]);

        echo json_encode(['ok' => true, 'token' => $token, 'user' => public_profile($u)]);
        exit;
    }

    if ($action === 'me') {
        require_login_api();
        echo json_encode(['ok' => true, 'user' => public_profile(current_user())]);
        exit;
    }

    if ($action === 'logout') {
        // Push token cleanup is the mobile app's job (POST push_register.php
        // ?action=unregister with its fcm_token) before calling this — this
        // only revokes the API session itself.
        $token = bearer_token();
        if ($token !== '') {
            db()->prepare('DELETE FROM api_tokens WHERE token = ?')->execute([$token]);
        }
        echo json_encode(['ok' => true]);
        exit;
    }

    throw new Exception('Unknown action.');

} catch (Throwable $e) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => $e->getMessage()]);
}
