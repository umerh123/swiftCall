<?php
require_once __DIR__ . '/includes/auth.php';

$error = '';
$ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';

function recent_failed_logins($ip) {
    $s = db()->prepare("SELECT COUNT(*) FROM logs WHERE kind = 'login_failed' AND detail = ? AND created_at > datetime('now', '-15 minutes')");
    $s->execute([$ip]);
    return (int)$s->fetchColumn();
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $u = $_POST['username'] ?? '';
    $p = $_POST['password'] ?? '';

    // Slow down guessing
    usleep(300000);

    if (recent_failed_logins($ip) >= 10) {
        $error = 'Too many failed attempts from this connection. Try again in a few minutes.';
    } elseif (attempt_login($u, $p)) {
        header('Location: index.php');
        exit;
    } else {
        log_event('login_failed', $ip);
        $error = 'That username or password is not right.';
    }
}

if (is_logged_in()) { header('Location: index.php'); exit; }
$cssVer = @filemtime(__DIR__ . '/assets/app.css') ?: time();
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0B1017">
<title>Sign in — Console</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;450;500;550;600;650;700;800&family=JetBrains+Mono:wght@300;400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="assets/app.css?v=<?= $cssVer ?>">
</head>
<body class="login-body">
  <div class="login-scene" aria-hidden="true"></div>
  <form class="login-card" method="post" autocomplete="on">
    <div class="login-mark">
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>
      </svg>
    </div>
    <h1>Console</h1>
    <p class="login-sub">Your line is private. Sign in to open it.</p>

    <?php if ($error): ?><div class="alert"><?= htmlspecialchars($error) ?></div><?php endif; ?>

    <label>Username
      <input name="username" required autofocus autocapitalize="none" autocomplete="username">
    </label>
    <label>Password
      <input name="password" type="password" required autocomplete="current-password">
    </label>
    <button type="submit">Sign in</button>
  </form>
</body>
</html>
