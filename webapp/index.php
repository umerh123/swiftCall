<?php
require_once __DIR__ . '/includes/auth.php';
require_once __DIR__ . '/includes/db.php';
require_login();
db();

$me = current_user();
if (!$me) { header('Location: login.php'); exit; }

$myNumber = $me['phone_number'] ?: '+1';
$setupNeeded = (TELNYX_API_KEY === '' || $myNumber === '+1' || $myNumber === '');
$prettyNum = preg_match('/^\+1(\d{3})(\d{3})(\d{4})$/', $myNumber, $m)
    ? "($m[1]) $m[2]-$m[3]" : $myNumber;
$username = $me['display_name'] ?: $me['username'];
$isAdmin = $me['role'] === 'admin';
$rtcReady = ($me['sip_username'] ?? '') !== '' && ($me['sip_password'] ?? '') !== '';
// Cache-busting: the version tag changes automatically whenever the file's
// contents change, so browsers never keep serving a stale cached copy after
// an update — no manual version bump ever needed.
$cssVer = @filemtime(__DIR__ . '/assets/app.css') ?: time();
$jsVer  = @filemtime(__DIR__ . '/assets/app.js') ?: time();
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0A0A11">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<link rel="manifest" href="manifest.json">
<title>SwiftByte</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;450;500;550;600;650;700;800&family=JetBrains+Mono:wght@300;400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="assets/app.css?v=<?= $cssVer ?>">
</head>
<body>

<div id="app">

  <!-- ===== SIDEBAR ===== -->
  <aside class="sidebar" id="sidebar">
    <div class="sb-logo">
      <div class="mark">
        <svg viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
      </div>
      <span>SwiftByte</span>
    </div>

    <nav class="sb-nav" id="sb-nav" aria-label="Sections">
      <button data-screen="messages" class="active" title="Messages">
        <svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        <span>Messages</span>
        <i class="badge" data-badge hidden></i>
      </button>
      <button data-screen="recents" title="Calls">
        <svg viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
        <span>Calls</span>
      </button>
      <button data-screen="contacts" title="Contacts">
        <svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        <span>Contacts</span>
      </button>
      <button data-screen="insights" title="Insights">
        <svg viewBox="0 0 24 24"><path d="M3 3v18h18"/><path d="M7 15l3.5-4 3 2.5L20 7"/></svg>
        <span>Insights</span>
      </button>
      <button data-screen="voicemail" title="Voicemail">
        <svg viewBox="0 0 24 24"><path d="M6 15a5 5 0 1 0 0-6M18 15a5 5 0 1 0 0-6"/><path d="M11 12h2"/></svg>
        <span>Voicemail</span>
        <i class="badge" data-vm-badge hidden></i>
      </button>
      <button data-screen="keypad" title="Keypad">
        <svg viewBox="0 0 24 24"><circle cx="5" cy="5" r="1.6"/><circle cx="12" cy="5" r="1.6"/><circle cx="19" cy="5" r="1.6"/><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/><circle cx="5" cy="19" r="1.6"/><circle cx="12" cy="19" r="1.6"/><circle cx="19" cy="19" r="1.6"/></svg>
        <span>Keypad</span>
      </button>
      <?php if ($isAdmin): ?>
      <button data-screen="team" title="Team">
        <svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        <span>Team</span>
      </button>
      <?php endif; ?>
    </nav>

    <div class="sb-foot">
      <button class="sb-quickcall" id="sb-quickcall" title="Open the keypad">
        <div class="qc-ico"><svg viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg></div>
        <div class="qc-text">
          <div class="qc-label">Make a call</div>
          <div class="qc-num"><?= htmlspecialchars($prettyNum) ?></div>
        </div>
      </button>

      <div style="position:relative">
        <button class="sb-profile" id="sb-profile-btn" title="Account">
          <div class="avatar" style="--av-bg:#1D4ED8"><?= htmlspecialchars(strtoupper(substr($username, 0, 1))) ?></div>
          <div class="sp-text">
            <div class="sp-name"><?= htmlspecialchars($username) ?></div>
            <div class="sp-role">Signed in</div>
          </div>
          <svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>
        </button>
        <div class="sb-menu" id="sb-menu" hidden>
          <?php if ($isAdmin): ?>
          <button id="sb-team"><svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>Team</button>
          <?php endif; ?>
          <button id="sb-audio"><svg viewBox="0 0 24 24"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/></svg>Audio settings</button>
          <button id="sb-export"><svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5M12 15V3"/></svg>Export data</button>
          <hr>
          <button class="danger" id="sb-logout"><svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/></svg>Sign out</button>
        </div>
      </div>
    </div>
  </aside>

  <div class="workspace">

    <!-- ===== TOP BAR ===== -->
    <header class="topbar">
      <div class="tb-status" id="tb-status">
        <div class="lamp nocall" id="lamp"></div>
        <span id="lamp-label">Starting…</span>
      </div>
      <div class="tally-live" id="tally-live"><i></i><span id="tally-live-t">00:00</span></div>

      <div class="tb-search">
        <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
        <input id="tb-search-input" placeholder="Search anything…" autocomplete="off" spellcheck="false" readonly>
        <span class="tb-kbd">⌘K</span>
      </div>

      <div class="tb-spacer"></div>

      <button class="tb-bell" id="tb-bell" title="Unread messages">
        <svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
        <i class="badge" data-badge hidden></i>
      </button>

      <div style="position:relative">
        <button class="tb-profile" id="tb-profile-btn">
          <div class="avatar" style="--av-bg:#1D4ED8"><?= htmlspecialchars(strtoupper(substr($username, 0, 1))) ?></div>
          <div class="tp-text">
            <div class="tp-name"><?= htmlspecialchars($username) ?></div>
            <div class="tp-sub" id="tb-line-sub">Line ready</div>
          </div>
          <svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>
        </button>
        <div class="sb-menu" id="tb-menu" hidden style="left:auto;right:0;bottom:auto;top:calc(100% + 8px)">
          <?php if ($isAdmin): ?>
          <button id="tb-team"><svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>Team</button>
          <?php endif; ?>
          <button id="tb-audio"><svg viewBox="0 0 24 24"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/></svg>Audio settings</button>
          <button id="tb-export"><svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5M12 15V3"/></svg>Export data</button>
          <hr>
          <button class="danger" id="tb-logout"><svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/></svg>Sign out</button>
        </div>
      </div>
    </header>

    <?php if ($setupNeeded): ?>
    <div class="setup-banner">Add your Telnyx keys in <strong>config.php</strong> before sending anything.</div>
    <?php endif; ?>

    <div class="main">

      <!-- ===== LIST PANE ===== -->
      <div class="pane-list" id="pane-list">

        <section class="list-section" id="section-messages">
          <div class="pane-head">
            <h1>Messages</h1>
            <span class="head-count" id="msg-count"></span>
            <button class="icon-btn" id="btn-new-message" style="background:var(--sig-wash);color:var(--sig)" title="New message">
              <svg viewBox="0 0 24 24"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
            </button>
          </div>
          <div class="search-wrap">
            <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
            <input id="thread-search" placeholder="Search conversations" autocomplete="off">
          </div>
          <div class="filter-tabs" id="msg-filter-tabs">
            <button data-filter="all" class="active">All <b id="filt-all-n">0</b></button>
            <button data-filter="unread">Unread <b id="filt-unread-n">0</b></button>
            <button data-filter="pinned">Pinned <b id="filt-pinned-n">0</b></button>
          </div>
          <div class="list" id="thread-list"></div>
        </section>

        <section class="list-section" id="section-recents" hidden>
          <div class="pane-head">
            <h1>Calls</h1>
            <span class="head-count" id="call-count"></span>
          </div>
          <div class="list" id="call-list"></div>
        </section>

        <section class="list-section" id="section-contacts" hidden>
          <div class="pane-head">
            <h1>Contacts</h1>
            <span class="head-count" id="contact-count"></span>
            <button class="icon-btn" id="btn-new-contact" style="background:var(--sig-wash);color:var(--sig)" title="Add contact">
              <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
            </button>
          </div>
          <div class="search-wrap">
            <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
            <input id="contact-search" placeholder="Search contacts" autocomplete="off">
          </div>
          <div class="list" id="contact-list"></div>
        </section>

        <section class="list-section" id="section-insights" hidden>
          <div class="pane-head">
            <h1>Insights</h1>
            <button class="icon-btn" id="btn-export" title="Export data">
              <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5M12 15V3"/></svg>
            </button>
          </div>
          <div class="insights" id="insights-body"></div>
        </section>

        <section class="list-section" id="section-voicemail" hidden>
          <div class="pane-head">
            <h1>Voicemail</h1>
            <span class="head-count" id="vm-count"></span>
          </div>
          <div class="list" id="voicemail-list"></div>
        </section>

        <?php if ($isAdmin): ?>
        <section class="list-section" id="section-team" hidden>
          <div class="pane-head">
            <h1>Team</h1>
            <span class="head-count" id="team-count"></span>
            <button class="icon-btn" id="btn-new-user" style="background:var(--sig-wash);color:var(--sig)" title="Add a person">
              <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
            </button>
          </div>
          <div class="list" id="team-list"></div>
          <div class="sys-panel">
            <button class="sys-toggle" id="sys-toggle">
              <span>System health</span>
              <svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>
            </button>
            <div class="sys-body" id="sys-body" hidden>
              <button class="btn-ghost" id="sys-backup">
                <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5M12 15V3"/></svg>
                Download full backup
              </button>
              <div class="field-hint">Downloads the entire database — every user's contacts, messages, calls, and voicemail. Keep it somewhere safe; it's not encrypted.</div>
              <div class="sys-logs-head">Recent errors</div>
              <div id="sys-logs"></div>
            </div>
          </div>
        </section>
        <?php endif; ?>


      </div>

      <!-- ===== THREAD PANE ===== -->
      <div class="pane-thread" id="pane-thread">
        <div class="thread-placeholder" id="thread-placeholder">
          <div class="tp-mark">
            <svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          </div>
          <strong>No conversation open</strong>
          <span>Pick a thread on the left, or press <b>⌘K</b> to jump anywhere.</span>
        </div>
        <div class="thread-view" id="thread-view" hidden>
          <div class="thread-head">
            <button class="icon-btn" id="thread-back" title="Back">
              <svg viewBox="0 0 24 24"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            </button>
            <div class="avatar thread-avatar" id="thread-avatar">?</div>
            <div class="thread-title">
              <span id="thread-name">—</span>
              <small id="thread-number-wrap"><a href="#" id="thread-add-contact">+ Add contact</a><span id="thread-number" hidden></span></small>
            </div>
            <button class="icon-btn" id="thread-call" title="Call">
              <svg viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
            </button>
            <button class="icon-btn" id="thread-menu-btn" title="More options">
              <svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="12" cy="19" r="1.7"/></svg>
            </button>
            <div class="kebab" id="thread-menu" hidden>
              <button data-tm="people"><svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>Contact details</button>
              <button data-tm="pin"><svg viewBox="0 0 24 24"><path d="M12 17v5M9 3h6l-1 7 4 3H6l4-3-1-7z"/></svg><span id="tm-pin-label">Pin to top</span></button>
              <button data-tm="copy"><svg viewBox="0 0 24 24"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>Copy number</button>
              <hr>
              <button data-tm="archive"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4"/></svg>Archive</button>
              <button data-tm="spam"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/></svg>Mark as spam</button>
              <button data-tm="block"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/></svg>Block number</button>
              <button data-tm="delete" class="danger"><svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>Delete conversation</button>
            </div>
          </div>
          <div class="bubbles" id="bubbles"></div>
          <div class="sched-bar" id="sched-bar" hidden>
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
            <span id="sched-label"></span>
            <button id="sched-cancel" title="Cancel scheduled send">
              <svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
          </div>
          <div class="char-note" id="char-note" hidden></div>
          <form class="composer" id="composer">
            <button type="button" class="comp-btn" id="btn-templates" title="Saved replies">
              <svg viewBox="0 0 24 24"><path d="M11 20H4a2 2 0 0 1-2-2 7 7 0 0 1 7-7h.5"/><path d="M19.5 9.5a2.12 2.12 0 0 1 3 3L15 20l-4 1 1-4z"/><circle cx="9" cy="7" r="4"/></svg>
            </button>
            <div class="composer-wrap">
              <textarea id="composer-input" rows="1" placeholder="Type a message…" maxlength="1600"></textarea>
            </div>
            <button type="button" class="comp-btn" id="btn-schedule" title="Send later">
              <svg viewBox="0 0 24 24"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg>
            </button>
            <button type="submit" class="send-btn" id="send-btn" title="Send">
              <svg viewBox="0 0 24 24"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
            </button>
          </form>
        </div>
      </div>

      <!-- ===== DIAL PANE ===== -->
      <div class="pane-dial" id="pane-dial">
        <button class="callas" id="callas-btn" title="This dialer uses one outbound line">
          <div class="callas-text">
            <div class="callas-label">Calling from</div>
            <div class="callas-number"><?= htmlspecialchars($prettyNum) ?></div>
          </div>
          <svg viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>
        </button>

        <div id="dial-idle">
          <div class="dial-tabs" id="dial-tabs">
            <button data-dtab="dialer" class="active">Dialer</button>
            <button data-dtab="recent">Recent</button>
            <button data-dtab="favorites">Favorites</button>
          </div>

          <div class="dial-sub-pane">
            <div id="dial-keypad-wrap">
              <div class="dial-input-row" id="dial-input-row">
                <input id="keypad-number" inputmode="tel" placeholder="Enter a name or number" autocomplete="off">
                <button class="dial-add-contact" id="keypad-add-contact" title="Save as contact">
                  <svg viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/></svg>
                </button>
              </div>
              <div class="keypad-hint" id="keypad-hint"></div>
              <div class="keypad" id="keypad">
                <button data-k="1"><span>1</span><em></em></button>
                <button data-k="2"><span>2</span><em>ABC</em></button>
                <button data-k="3"><span>3</span><em>DEF</em></button>
                <button data-k="4"><span>4</span><em>GHI</em></button>
                <button data-k="5"><span>5</span><em>JKL</em></button>
                <button data-k="6"><span>6</span><em>MNO</em></button>
                <button data-k="7"><span>7</span><em>PQRS</em></button>
                <button data-k="8"><span>8</span><em>TUV</em></button>
                <button data-k="9"><span>9</span><em>WXYZ</em></button>
                <button data-k="*"><span>*</span><em></em></button>
                <button data-k="0"><span>0</span><em>+</em></button>
                <button data-k="#"><span>#</span><em></em></button>
              </div>
              <div class="keypad-actions">
                <button class="ka-call" id="keypad-call" title="Call">
                  <svg viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                  Call
                </button>
                <button class="ka-side" id="keypad-back" title="Delete">
                  <svg viewBox="0 0 24 24"><path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zM18 9l-6 6M12 9l6 6"/></svg>
                </button>
              </div>
            </div>

            <div class="dial-sub-pane" id="dial-recent-wrap" hidden style="padding-top:8px">
              <div class="list" id="dial-recent-list"></div>
            </div>

            <div class="dial-sub-pane" id="dial-fav-wrap" hidden style="padding-top:8px">
              <div class="list" id="dial-fav-list"></div>
            </div>
          </div>

          <div class="audio-bar">
            <svg viewBox="0 0 24 24"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a9 9 0 0 1 0 14"/></svg>
            <input type="range" id="vol-slider" min="0" max="100" step="5" title="Call volume">
            <span class="vol-val" id="vol-val">100%</span>
            <button id="audio-settings" title="Audio devices">
              <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            </button>
          </div>
        </div>

        <!-- active call card (replaces the idle dialer while a call is live) -->
        <div class="call-card" id="call-card" hidden>
          <div class="call-avatar" id="call-avatar">?</div>
          <div class="cc-name" id="call-name">—</div>
          <div class="cc-status" id="call-status"></div>
          <div class="cc-timer" id="call-timer"></div>

          <div class="wave" id="call-wave" aria-hidden="true"></div>

          <div class="cc-qual" id="call-qual" hidden>
            <div class="qbars" id="qbars"><i></i><i></i><i></i><i></i></div>
            <span id="qual-label">Checking line…</span>
          </div>

          <div class="cp-pills">
            <button class="cp-pill" id="call-hold">
              <svg viewBox="0 0 24 24"><rect x="7" y="5" width="3.4" height="14" rx="1.2"/><rect x="13.6" y="5" width="3.4" height="14" rx="1.2"/></svg>
              <span>Hold</span>
            </button>
            <button class="cp-pill" id="call-note">
              <svg viewBox="0 0 24 24"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
              <span>Note</span>
            </button>
            <button class="cp-pill" id="call-message">
              <svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              <span>Message</span>
            </button>
          </div>

          <div class="cp-rounds">
            <button class="cp-round" id="call-keypad" title="Keypad">
              <svg viewBox="0 0 24 24"><circle cx="5" cy="5" r="1.7"/><circle cx="12" cy="5" r="1.7"/><circle cx="19" cy="5" r="1.7"/><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/><circle cx="5" cy="19" r="1.7"/><circle cx="12" cy="19" r="1.7"/><circle cx="19" cy="19" r="1.7"/></svg>
              <span>Keypad</span>
            </button>
            <button class="cp-round" id="call-mute" title="Mute">
              <svg viewBox="0 0 24 24"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4"/></svg>
              <span>Mute</span>
            </button>
            <button class="cp-round rec" id="call-record" title="Record this call">
              <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7"/></svg>
              <span>Record</span>
            </button>
            <button class="cp-round" id="call-transcript" title="Live transcript">
              <svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h10"/></svg>
              <span>Transcript</span>
            </button>
          </div>

          <button class="cp-end" id="call-end" title="End call">
            <svg viewBox="0 0 24 24" style="transform:rotate(135deg)"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
          </button>
          <div class="call-dtmf" id="call-dtmf" hidden></div>
        </div>
      </div>

    </div>
  </div>

  <!-- ===== MOBILE TABS ===== -->
  <nav class="tabs" id="tabs" aria-label="Sections">
    <button data-screen="messages" class="active">
      <svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      <span>Messages</span>
      <i class="badge" data-badge hidden></i>
    </button>
    <button data-screen="keypad">
      <svg viewBox="0 0 24 24"><circle cx="5" cy="5" r="1.6"/><circle cx="12" cy="5" r="1.6"/><circle cx="19" cy="5" r="1.6"/><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/><circle cx="5" cy="19" r="1.6"/><circle cx="12" cy="19" r="1.6"/><circle cx="19" cy="19" r="1.6"/></svg>
      <span>Keypad</span>
    </button>
    <button data-screen="contacts">
      <svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
      <span>Contacts</span>
    </button>
    <button data-screen="recents">
      <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
      <span>Calls</span>
    </button>
    <button data-screen="insights">
      <svg viewBox="0 0 24 24"><path d="M3 3v18h18"/><path d="M7 15l3.5-4 3 2.5L20 7"/></svg>
      <span>Insights</span>
    </button>
    <button data-screen="voicemail">
      <svg viewBox="0 0 24 24"><path d="M6 15a5 5 0 1 0 0-6M18 15a5 5 0 1 0 0-6"/><path d="M11 12h2"/></svg>
      <span>Voicemail</span>
      <i class="badge" data-vm-badge hidden></i>
    </button>
  </nav>

  <!-- ===== INCOMING CALL CARD ===== -->
  <!-- ===== LIVE TRANSCRIPT (floating, draggable) ===== -->
  <div class="transcript-panel" id="transcript-panel" hidden>
    <div class="tp-head" id="transcript-drag-handle">
      <svg class="tp-grip" viewBox="0 0 24 24"><circle cx="8" cy="6" r="1.3"/><circle cx="16" cy="6" r="1.3"/><circle cx="8" cy="12" r="1.3"/><circle cx="16" cy="12" r="1.3"/><circle cx="8" cy="18" r="1.3"/><circle cx="16" cy="18" r="1.3"/></svg>
      <span>Live transcript</span>
      <span class="tp-status" id="transcript-status">Connecting…</span>
      <button class="tp-close" id="transcript-close" title="Close">
        <svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>
      </button>
    </div>
    <div class="tp-body" id="transcript-body"></div>
  </div>

  <div class="incoming-card" id="incoming-card" hidden>
    <div class="ic-top">
      <div class="call-avatar sm pulse" id="incoming-avatar">?</div>
      <div class="ic-info">
        <div class="ic-label">Incoming call</div>
        <div class="ic-name" id="incoming-name">—</div>
        <div class="ic-sub" id="incoming-sub"></div>
      </div>
    </div>
    <div class="ic-actions">
      <button class="ic-btn ic-decline" id="incoming-decline">
        <svg viewBox="0 0 24 24" style="transform:rotate(135deg)"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
        Decline
      </button>
      <button class="ic-btn ic-answer" id="incoming-answer">
        <svg viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
        Answer
      </button>
    </div>
  </div>

  <!-- ===== MOBILE IN-CALL BAR ===== -->
  <div class="minibar" id="minibar" hidden>
    <div class="mini-wave" id="mini-wave"></div>
    <span id="minibar-name">—</span>
    <span id="minibar-timer"></span>
    <button id="minibar-end" title="End call">
      <svg viewBox="0 0 24 24" style="transform:rotate(135deg)"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
    </button>
  </div>

  <!-- ===== COMMAND PALETTE ===== -->
  <div class="cmdk-backdrop" id="cmdk-backdrop" hidden>
    <div class="cmdk" id="cmdk" role="dialog" aria-label="Search everything">
      <div class="cmdk-input-row">
        <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
        <input id="cmdk-input" placeholder="Search people, messages, or type a number…" autocomplete="off" spellcheck="false">
        <span class="cmdk-hint">ESC</span>
      </div>
      <div class="cmdk-list" id="cmdk-list"></div>
    </div>
  </div>

  <!-- ===== SHEET ===== -->
  <div class="sheet-backdrop" id="sheet-backdrop" hidden>
    <div class="sheet" id="sheet" role="dialog" aria-labelledby="sheet-title">
      <div class="sheet-head">
        <h2 id="sheet-title">New message</h2>
        <button class="icon-btn" id="sheet-close" title="Close">
          <svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      </div>
      <div class="sheet-body" id="sheet-body"></div>
    </div>
  </div>

  <div class="toast" id="toast" hidden></div>
  <div class="msg-toast-stack" id="msg-toast-stack"></div>

</div>

<audio id="remote-audio" autoplay playsinline></audio>

<script>
window.CSRF = <?= json_encode(csrf_token()) ?>;
window.MY_NUMBER = <?= json_encode($myNumber) ?>;
window.RTC_READY = <?= json_encode($rtcReady) ?>;
window.IS_ADMIN = <?= json_encode($isAdmin) ?>;
</script>
<script src="https://cdn.jsdelivr.net/npm/@telnyx/webrtc@2.22.4/lib/bundle.js" onerror="window.TELNYX_CDN_FAILED=true"></script>
<script src="assets/app.js?v=<?= $jsVer ?>"></script>
</body>
</html>
