<?php
require_once __DIR__ . '/../config.php';

function db() {
    static $pdo = null;
    if ($pdo !== null) return $pdo;

    $dir = dirname(DB_PATH);
    if (!is_dir($dir)) @mkdir($dir, 0755, true);

    $pdo = new PDO('sqlite:' . DB_PATH);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    $pdo->exec('PRAGMA journal_mode = WAL');
    $pdo->exec('PRAGMA busy_timeout = 5000'); // wait up to 5s on a lock instead of failing instantly — matters once more than one person is using this at once

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            display_name TEXT NOT NULL,
            phone_number TEXT,
            sip_connection_id TEXT,
            sip_username TEXT,
            sip_password TEXT,
            role TEXT NOT NULL DEFAULT 'agent',
            active INTEGER DEFAULT 1,
            created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS contacts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            phone TEXT NOT NULL,
            name TEXT,
            notes TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            telnyx_id TEXT,
            phone TEXT NOT NULL,
            direction TEXT NOT NULL,
            body TEXT,
            status TEXT DEFAULT 'queued',
            error TEXT,
            read_flag INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS calls (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            call_id TEXT,
            phone TEXT,
            direction TEXT,
            status TEXT,
            duration INTEGER DEFAULT 0,
            recording_url TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS thread_meta (
            user_id INTEGER NOT NULL,
            phone TEXT NOT NULL,
            archived INTEGER DEFAULT 0,
            blocked INTEGER DEFAULT 0,
            PRIMARY KEY (user_id, phone)
        );
        CREATE TABLE IF NOT EXISTS logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            kind TEXT,
            detail TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS voicemails (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            phone TEXT NOT NULL,
            call_session_id TEXT,
            recording_url TEXT NOT NULL,
            duration INTEGER DEFAULT 0,
            listened INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_msg_phone ON messages(phone);
        CREATE INDEX IF NOT EXISTS idx_vm_phone ON voicemails(phone);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_msg_tid ON messages(telnyx_id) WHERE telnyx_id IS NOT NULL;
    ");

    migrate_to_multiuser($pdo);

    return $pdo;
}

/**
 * Brings an existing single-user database up to the multi-user schema.
 * Every step below only runs once — each one checks for its own
 * completion first — so this is safe to call on every request forever.
 */
function migrate_to_multiuser($pdo) {
    // Seed the very first account from config.php the first time this
    // ever runs, so an existing install's login and history keep working
    // without anyone having to do anything by hand.
    $userCount = (int) $pdo->query('SELECT COUNT(*) FROM users')->fetchColumn();
    if ($userCount === 0) {
        $username = defined('APP_USER') && APP_USER !== '' ? APP_USER : 'admin';
        $password = defined('APP_PASS') && APP_PASS !== '' ? APP_PASS : 'change-this-password';
        $stmt = $pdo->prepare("
            INSERT INTO users (username, password_hash, display_name, phone_number, sip_connection_id, sip_username, sip_password, role)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'admin')
        ");
        $stmt->execute([
            $username,
            password_hash($password, PASSWORD_DEFAULT),
            $username,
            defined('TELNYX_NUMBER') ? TELNYX_NUMBER : '',
            defined('SIP_CONNECTION_ID') ? SIP_CONNECTION_ID : '',
            defined('SIP_USERNAME') ? SIP_USERNAME : '',
            defined('SIP_PASSWORD') ? SIP_PASSWORD : '',
        ]);
    }

    $adminId = (int) $pdo->query("SELECT id FROM users WHERE role='admin' ORDER BY id ASC LIMIT 1")->fetchColumn();
    if (!$adminId) $adminId = (int) $pdo->query('SELECT id FROM users ORDER BY id ASC LIMIT 1')->fetchColumn();

    // messages / calls / voicemails: a nullable column can just be added —
    // nothing about their existing constraints blocks this.
    foreach (['messages', 'calls', 'voicemails'] as $table) {
        if (!column_exists($pdo, $table, 'user_id')) {
            $pdo->exec("ALTER TABLE $table ADD COLUMN user_id INTEGER");
            $pdo->exec("UPDATE $table SET user_id = $adminId WHERE user_id IS NULL");
        }
        // safe now regardless of which branch ran above
        $pdo->exec("CREATE INDEX IF NOT EXISTS idx_{$table}_user ON $table(user_id)");
    }

    // contacts: the old schema had UNIQUE(phone) alone, which would stop a
    // second user ever saving a contact number the first user already has.
    // Rebuilding is the only way SQLite lets us change that constraint.
    if (!column_exists($pdo, 'contacts', 'user_id')) {
        $pdo->exec("
            CREATE TABLE contacts_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                phone TEXT NOT NULL,
                name TEXT,
                notes TEXT,
                created_at TEXT DEFAULT (datetime('now'))
            )
        ");
        $pdo->exec("INSERT INTO contacts_new (user_id, phone, name, notes, created_at) SELECT $adminId, phone, name, notes, created_at FROM contacts");
        $pdo->exec("DROP TABLE contacts");
        $pdo->exec("ALTER TABLE contacts_new RENAME TO contacts");
    }
    // Safe now regardless of which branch ran above — user_id is guaranteed
    // to exist on contacts at this point either way.
    $pdo->exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_user_phone ON contacts(user_id, phone)");

    // Stops a retried voicemail webhook from creating a duplicate entry —
    // only enforced when there's an actual session id to compare, so two
    // genuinely different voicemails that both lack one are never conflated.
    // If duplicates already exist from before this fix, CREATE UNIQUE INDEX
    // itself would fail — so clean those up first if that happens, then
    // retry, rather than let a fresh page load hard-crash on old data.
    try {
        $pdo->exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_vm_session ON voicemails(user_id, call_session_id) WHERE call_session_id IS NOT NULL AND call_session_id != ''");
    } catch (Throwable $e) {
        $pdo->exec("
            DELETE FROM voicemails WHERE id NOT IN (
                SELECT MIN(id) FROM voicemails
                WHERE call_session_id IS NOT NULL AND call_session_id != ''
                GROUP BY user_id, call_session_id
            ) AND call_session_id IS NOT NULL AND call_session_id != ''
        ");
        $pdo->exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_vm_session ON voicemails(user_id, call_session_id) WHERE call_session_id IS NOT NULL AND call_session_id != ''");
    }

    // thread_meta: same story — the old primary key was phone alone.
    if (!column_exists($pdo, 'thread_meta', 'user_id')) {
        $pdo->exec("
            CREATE TABLE thread_meta_new (
                user_id INTEGER NOT NULL,
                phone TEXT NOT NULL,
                archived INTEGER DEFAULT 0,
                blocked INTEGER DEFAULT 0,
                PRIMARY KEY (user_id, phone)
            )
        ");
        $pdo->exec("INSERT INTO thread_meta_new (user_id, phone, archived, blocked) SELECT $adminId, phone, archived, blocked FROM thread_meta");
        $pdo->exec("DROP TABLE thread_meta");
        $pdo->exec("ALTER TABLE thread_meta_new RENAME TO thread_meta");
    }
}

function column_exists($pdo, $table, $column) {
    $cols = $pdo->query("PRAGMA table_info($table)")->fetchAll(PDO::FETCH_ASSOC);
    foreach ($cols as $c) if ($c['name'] === $column) return true;
    return false;
}

function log_event($kind, $detail) {
    try {
        $s = db()->prepare('INSERT INTO logs (kind, detail) VALUES (?, ?)');
        $s->execute([$kind, is_string($detail) ? $detail : json_encode($detail)]);
        db()->exec("DELETE FROM logs WHERE id NOT IN (SELECT id FROM logs ORDER BY id DESC LIMIT 300)");
    } catch (Throwable $e) { /* logging must never break the app */ }
}

/** Normalise anything the user types into +1XXXXXXXXXX */
function normalize_phone($raw) {
    $d = preg_replace('/[^0-9+]/', '', (string)$raw);
    if ($d === '') return '';
    if ($d[0] === '+') return $d;
    if (strlen($d) === 10) return '+1' . $d;
    if (strlen($d) === 11 && $d[0] === '1') return '+' . $d;
    return '+' . $d;
}

function pretty_phone($e164) {
    if (preg_match('/^\+1(\d{3})(\d{3})(\d{4})$/', $e164, $m)) {
        return "($m[1]) $m[2]-$m[3]";
    }
    return $e164;
}
