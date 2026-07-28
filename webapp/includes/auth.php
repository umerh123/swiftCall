<?php
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/db.php';

if (session_status() === PHP_SESSION_NONE) {
    session_set_cookie_params([
        'lifetime' => 0,
        'httponly' => true,
        'samesite' => 'Lax',
        'secure'   => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off'),
    ]);
    session_start();
}

/** Pulls "Bearer xxx" out of the Authorization header, however this host
 *  hands it to PHP (some shared hosts only expose it via getallheaders()). */
function bearer_token() {
    $hdr = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if ($hdr === '' && function_exists('getallheaders')) {
        foreach (getallheaders() as $k => $v) {
            if (strtolower($k) === 'authorization') { $hdr = $v; break; }
        }
    }
    if (preg_match('/Bearer\s+(\S+)/i', $hdr, $m)) return $m[1];
    return '';
}

/** The mobile app authenticates with a long-lived API token instead of a
 *  cookie session. Resolves it to a user row, or null. Cached per-request. */
function user_from_bearer_token() {
    static $cached = false;
    if ($cached !== false) return $cached;
    $token = bearer_token();
    if ($token === '') { $cached = null; return null; }
    $s = db()->prepare("
        SELECT u.* FROM users u
        JOIN api_tokens t ON t.user_id = u.id
        WHERE t.token = ? AND u.active = 1
    ");
    $s->execute([$token]);
    $u = $s->fetch();
    if ($u) {
        db()->prepare("UPDATE api_tokens SET last_used_at = datetime('now') WHERE token = ?")->execute([$token]);
    }
    $cached = $u ?: null;
    return $cached;
}

function is_logged_in() {
    return !empty($_SESSION['user_id']) || user_from_bearer_token() !== null;
}

/** The full row for whoever is signed in, or null. Cached per-request.
 *  Checks the session cookie first (the web app), then an API bearer
 *  token (the mobile app) — either one is enough. */
function current_user() {
    static $cached = false; // false = not looked up yet; null = looked up, no user
    if ($cached !== false) return $cached;

    if (!empty($_SESSION['user_id'])) {
        $s = db()->prepare('SELECT * FROM users WHERE id = ? AND active = 1');
        $s->execute([$_SESSION['user_id']]);
        $u = $s->fetch();
        if ($u) { $cached = $u; return $cached; }
    }

    $cached = user_from_bearer_token();
    return $cached;
}

function is_admin() {
    $u = current_user();
    return $u && $u['role'] === 'admin';
}

/** Checks username + password, and starts the session on success. */
function attempt_login($username, $password) {
    $s = db()->prepare('SELECT * FROM users WHERE username = ? AND active = 1');
    $s->execute([trim((string)$username)]);
    $u = $s->fetch();
    if (!$u || !password_verify((string)$password, $u['password_hash'])) return false;
    session_regenerate_id(true);
    $_SESSION['user_id'] = $u['id'];
    return true;
}

function require_login() {
    if (!is_logged_in()) {
        header('Location: login.php');
        exit;
    }
}

/** For /api/*.php — returns JSON 401 instead of redirecting. */
function require_login_api() {
    if (!is_logged_in() || !current_user()) {
        http_response_code(401);
        header('Content-Type: application/json');
        echo json_encode(['ok' => false, 'error' => 'Please sign in again.']);
        exit;
    }
}

/** For admin-only endpoints, like managing the team. */
function require_admin_api() {
    require_login_api();
    if (!is_admin()) {
        http_response_code(403);
        header('Content-Type: application/json');
        echo json_encode(['ok' => false, 'error' => 'Only an admin can do that.']);
        exit;
    }
}

function csrf_token() {
    if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(16));
    return $_SESSION['csrf'];
}

function check_csrf($token) {
    // Bearer-token requests (the mobile app) carry no ambient cookie, so
    // there is nothing for a cross-site request to forge — CSRF doesn't
    // apply to them the way it does to the cookie-based web session.
    if (bearer_token() !== '' && user_from_bearer_token() !== null) return true;
    return !empty($_SESSION['csrf']) && hash_equals($_SESSION['csrf'], (string)$token);
}
