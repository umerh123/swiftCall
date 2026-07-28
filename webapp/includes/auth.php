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

function is_logged_in() {
    return !empty($_SESSION['user_id']);
}

/** The full row for whoever is signed in, or null. Cached per-request. */
function current_user() {
    static $cached = false; // false = not looked up yet; null = looked up, no user
    if ($cached !== false) return $cached;
    if (empty($_SESSION['user_id'])) { $cached = null; return null; }
    $s = db()->prepare('SELECT * FROM users WHERE id = ? AND active = 1');
    $s->execute([$_SESSION['user_id']]);
    $u = $s->fetch();
    $cached = $u ?: null;
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
    return !empty($_SESSION['csrf']) && hash_equals($_SESSION['csrf'], (string)$token);
}
