<?php
/**
 * Open this in your browser after uploading: yourdomain.com/dialer/check.php
 * It tells you whether your hosting can run the app, in plain English.
 */
require_once __DIR__ . '/config.php';

$checks = [];

// --- PHP version ---
$checks[] = [
    'PHP version',
    version_compare(PHP_VERSION, '7.4', '>='),
    PHP_VERSION,
    'Ask your host to switch this site to PHP 7.4 or newer (usually under "Select PHP Version" in cPanel).',
];

// --- Extensions ---
$checks[] = ['Database support (pdo_sqlite)', extension_loaded('pdo_sqlite'), '', 'Enable the "pdo_sqlite" extension in cPanel > Select PHP Version > Extensions.'];
$checks[] = ['Internet requests (curl)', extension_loaded('curl'), '', 'Enable the "curl" extension in cPanel > Select PHP Version > Extensions.'];
$checks[] = ['Sessions', function_exists('session_start'), '', 'Sessions are disabled. Contact your host.'];

$sodium = function_exists('sodium_crypto_sign_verify_detached');
$checks[] = [
    'Webhook signature checking (sodium)',
    $sodium,
    $sodium ? '' : 'not available',
    'Optional but recommended. Without it the app still works, but it cannot verify that incoming texts really came from Telnyx. Ask your host to enable the "sodium" extension.',
    true, // warning only
];

// --- Writable data folder ---
$dir = __DIR__ . '/data';
if (!is_dir($dir)) @mkdir($dir, 0755, true);
$writable = is_dir($dir) && is_writable($dir);
$checks[] = [
    'Data folder is writable',
    $writable,
    $dir,
    'In cPanel File Manager, right-click the "data" folder > Change Permissions > set to 755. If that fails, try 775.',
];

// --- HTTPS ---
$https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
      || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
$checks[] = [
    'Secure connection (https)',
    $https,
    '',
    'Calling from the browser will not work without https. Turn on the free SSL certificate in cPanel (look for "SSL/TLS Status" or "Let\'s Encrypt").',
];

// --- Config filled in ---
$checks[] = ['Telnyx API key filled in', TELNYX_API_KEY !== '', '', 'Open config.php and paste your API key.', true];
$checks[] = ['Phone number filled in', TELNYX_NUMBER !== '' && TELNYX_NUMBER !== '+1', TELNYX_NUMBER, 'Open config.php and enter your Telnyx number, e.g. +12125551234', true];
$checks[] = ['Password changed', APP_PASS !== 'change-this-password', '', 'Open config.php and set your own password.', true];

$guessedUrl = ($https ? 'https://' : 'http://') . ($_SERVER['HTTP_HOST'] ?? 'yourdomain.com')
            . rtrim(dirname($_SERVER['SCRIPT_NAME'] ?? ''), '/');
$urlMatches = rtrim(APP_URL, '/') === $guessedUrl;
$checks[] = ['Web address in config matches', $urlMatches, $guessedUrl, 'Set APP_URL in config.php to exactly: ' . $guessedUrl, true];

// --- Can we reach Telnyx? ---
$reach = null;
if (extension_loaded('curl')) {
    $ch = curl_init('https://api.telnyx.com/v2/messaging_profiles');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 12,
        CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . TELNYX_API_KEY],
    ]);
    curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err  = curl_error($ch);
    curl_close($ch);

    if ($code === 200)      $reach = [true,  'Connected — your API key works.'];
    elseif ($code === 401)  $reach = [false, 'Reached Telnyx, but the API key is wrong. Check config.php.'];
    elseif ($code === 0)    $reach = [false, 'Could not reach Telnyx: ' . $err . ' — your host may block outgoing connections. Ask support to allow outbound https to api.telnyx.com.'];
    else                    $reach = [false, 'Telnyx replied with code ' . $code . '.'];
}

$failed = 0;
foreach ($checks as $c) if (!$c[1] && empty($c[4])) $failed++;
?>
<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Setup check</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#0d1117;color:#e6edf3;margin:0;padding:24px;line-height:1.5}
.wrap{max-width:620px;margin:0 auto}
h1{font-size:22px;margin:0 0 6px}
.sub{color:#8b98a5;font-size:14px;margin-bottom:22px}
.item{background:#161b22;border:1px solid #262d38;border-radius:12px;padding:14px 16px;margin-bottom:10px}
.top{display:flex;align-items:center;gap:10px}
.mark{width:22px;height:22px;border-radius:50%;display:grid;place-items:center;font-size:13px;font-weight:700;flex:none}
.ok{background:#22c55e;color:#06240f}.bad{background:#ef4444;color:#fff}.warn{background:#f59e0b;color:#1a1200}
.name{font-weight:600;font-size:15px;flex:1}
.val{color:#8b98a5;font-size:12.5px;font-family:ui-monospace,monospace}
.fix{margin-top:9px;padding-top:9px;border-top:1px solid #262d38;color:#c9d4df;font-size:13.5px}
.banner{padding:15px 17px;border-radius:12px;margin-bottom:20px;font-size:15px}
.good{background:rgba(34,197,94,.13);border:1px solid rgba(34,197,94,.4)}
.stop{background:rgba(239,68,68,.13);border:1px solid rgba(239,68,68,.4)}
a{color:#3b82f6}
</style></head><body><div class="wrap">
<h1>Setup check</h1>
<div class="sub">This page tells you if your hosting can run the dialer.</div>

<?php if ($failed === 0): ?>
  <div class="banner good"><strong>Your hosting works.</strong> Anything marked orange below is a setting you still need to fill in, not a hosting problem.</div>
<?php else: ?>
  <div class="banner stop"><strong><?= $failed ?> thing<?= $failed > 1 ? 's' : '' ?> must be fixed</strong> before the app will run. Each one below tells you exactly what to do.</div>
<?php endif; ?>

<?php foreach ($checks as $c):
  [$name, $pass, $val, $fix] = $c;
  $isWarn = !empty($c[4]);
  $cls = $pass ? 'ok' : ($isWarn ? 'warn' : 'bad');
  $sym = $pass ? '✓' : ($isWarn ? '!' : '✕');
?>
  <div class="item">
    <div class="top">
      <div class="mark <?= $cls ?>"><?= $sym ?></div>
      <div class="name"><?= htmlspecialchars($name) ?></div>
      <div class="val"><?= htmlspecialchars($val) ?></div>
    </div>
    <?php if (!$pass): ?><div class="fix"><?= htmlspecialchars($fix) ?></div><?php endif; ?>
  </div>
<?php endforeach; ?>

<?php if ($reach): ?>
  <div class="item">
    <div class="top">
      <div class="mark <?= $reach[0] ? 'ok' : 'warn' ?>"><?= $reach[0] ? '✓' : '!' ?></div>
      <div class="name">Connection to Telnyx</div>
    </div>
    <?php if (!$reach[0]): ?><div class="fix"><?= htmlspecialchars($reach[1]) ?></div><?php endif; ?>
  </div>
<?php endif; ?>

<div class="item">
  <div class="top"><div class="name">Your webhook address</div></div>
  <div class="fix">Paste this into Telnyx (both the Messaging Profile and the Voice app):<br>
    <span class="val"><?= htmlspecialchars(rtrim(APP_URL, '/') . '/api/webhook.php') ?></span>
  </div>
</div>

<p style="margin-top:20px"><a href="index.php">Open the dialer →</a></p>
<p style="color:#8b98a5;font-size:13px">Delete this file once everything is green.</p>
</div></body></html>
