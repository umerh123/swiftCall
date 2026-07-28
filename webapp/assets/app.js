/* ============================================================
   CONSOLE — dialer front-end
   Desktop: rail + list + thread + dial pad
   Mobile:  tabbed screens, thread as overlay

   Premium layer:
     · Command palette (Ctrl/Cmd K) across contacts + messages
     · Saved replies with {name} merge tokens
     · Scheduled send (survives reload, fires when tab is open)
     · Pinned threads
     · Live mic waveform + call quality meter from real WebRTC stats
     · Insights: volume, response time, busiest hours, top contacts
     · Draft persistence per thread
     · Call notes written into the thread
     · Export to CSV
   ============================================================ */
(() => {
'use strict';

/* ---------- global safety net ---------- */
window.addEventListener('error', (e) => { console.error('caught:', e.message); });
window.addEventListener('unhandledrejection', (e) => {
  console.error('caught promise:', e.reason);
  e.preventDefault();
});

async function fetchRetry(url, opts = {}, tries = 2) {
  for (let i = 0; i <= tries; i++) {
    try {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 15000);
      const r = await fetch(url, { ...opts, signal: ctrl.signal });
      clearTimeout(to);
      return r;
    } catch (err) {
      if (i === tries) throw err;
      await new Promise(r => setTimeout(r, 400 * (i + 1)));
    }
  }
}

const $  = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const on = (sel, ev, fn) => { const el = $(sel); if (el) el.addEventListener(ev, fn); };
const mqDesktop = window.matchMedia('(min-width: 900px)');
const isDesktop = () => mqDesktop.matches;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* Avatar palette — tuned for the dark panel, all readable against #06111A text */
const AV_COLORS = ['#334155','#0F766E','#1D4ED8','#7C2D12','#3F3F46','#4D7C0F'];

const state = {
  screen: 'messages',
  threads: [],
  activePhone: null,
  contacts: [],
  calls: [],
  lastMsgId: 0,
  call: null,
  client: null,
  rtcReady: false,
  rtcRetry: 0,
  rtcConnecting: false,   // true while a registration attempt is in flight — prevents duplicate clients
  threadQuery: '',
  threadFilter: 'all',
  contactQuery: '',
  booted: false,
};

let currentMsgs = [];
const msgCache = {};

/* ---------- local store (prefs that never touch the server) ---------- */
const store = {
  get(k, dflt) {
    try { const v = localStorage.getItem('dial_' + k); return v == null ? dflt : JSON.parse(v); }
    catch { return dflt; }
  },
  set(k, v) { try { localStorage.setItem('dial_' + k, JSON.stringify(v)); } catch {} },
};

/* ---------------- helpers ---------------- */

/* Cheap but reliable equality check for the small JSON arrays this app
   deals with — lets a render function skip rebuilding the DOM (and
   replaying every row's entrance animation) when a background refresh
   turns up exactly the same data that's already on screen. */
function sameData(a, b) {
  try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function normalize(raw) {
  let d = String(raw || '').replace(/[^0-9+]/g, '');
  if (!d) return '';
  if (d[0] === '+') return d;
  if (d.length === 10) return '+1' + d;
  if (d.length === 11 && d[0] === '1') return '+' + d;
  return '+' + d;
}

function pretty(e164) {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164 || '');
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : (e164 || '');
}

function initials(name, phone) {
  if (name && name.trim()) {
    const p = name.trim().split(/\s+/);
    return ((p[0][0] || '') + (p[1]?.[0] || '')).toUpperCase();
  }
  return (phone || '?').slice(-2);
}

function avColor(key) {
  let h = 0;
  for (const ch of String(key || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AV_COLORS[h % AV_COLORS.length];
}

function avatarHTML(name, phone, cls) {
  return `<div class="avatar ${cls || ''}" style="--av-bg:${avColor(phone)}">${esc(initials(name, phone))}</div>`;
}

function parseTime(s) {
  if (!s) return new Date();
  return new Date(s.replace(' ', 'T') + (s.endsWith('Z') ? '' : 'Z'));
}

function timeAgo(s) {
  const d = parseTime(s), now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60) return 'now';
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const y = new Date(now); y.setDate(y.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  if (diff < 604800) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { month: 'numeric', day: 'numeric' });
}

function clock(sec) {
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2, '0')}`;
}

/* name for a number, from contacts or threads */
function nameFor(phone) {
  const c = state.contacts.find(x => x.phone === phone);
  if (c?.name) return c.name;
  const t = state.threads.find(x => x.phone === phone);
  if (t?.name) return t.name;
  return '';
}
function displayFor(phone) { return nameFor(phone) || pretty(phone); }

let toastTimer;
function toast(msg, kind) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast' + (kind === 'err' ? ' err' : kind === 'good' ? ' good' : '');
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, kind === 'err' ? 5200 : 2800);
}

function lamp(stateName, label) {
  $('#lamp').className = 'lamp ' + stateName;
  $('#lamp-label').textContent = label;
  $('#tb-status').classList.toggle('is-connecting', stateName === 'connecting');
  const sub = $('#tb-line-sub');
  if (sub) {
    sub.textContent = label;
    sub.style.color = stateName === 'ready' ? 'var(--ok)'
      : stateName === 'off' ? 'var(--bad)'
      : stateName === 'connecting' ? 'var(--warn)' : 'var(--tx-4)';
  }
}

let offlineToasted = false;
async function api(url, opts) {
  try {
    const r = await fetchRetry(url, opts);
    if (r.status === 401) { location.href = 'login.php'; throw new Error('signed out'); }
    if (offlineToasted) { offlineToasted = false; toast('Back online', 'good'); }
    return await r.json().catch(() => ({ ok: false, error: 'The server sent something unexpected. Try refreshing.' }));
  } catch (err) {
    if (String(err.message) === 'signed out') throw err;
    if (!offlineToasted) {
      offlineToasted = true;
      toast('Connection problem — retrying in the background.', 'err');
    }
    return { ok: false, error: 'offline', _offline: true };
  }
}

const postJSON = (url, body) => api(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ ...body, csrf: window.CSRF }),
});

function haptic(ms) { if (navigator.vibrate && !reduceMotion) navigator.vibrate(ms); }

/* ---------- DTMF keypad tones ----------
   Real telephone dual-tone frequencies (ITU-T Q.23), so each key
   is genuinely, audibly distinct — not a generic "beep".            */
const DTMF_FREQ = {
  '1': [697, 1209], '2': [697, 1336], '3': [697, 1477],
  '4': [770, 1209], '5': [770, 1336], '6': [770, 1477],
  '7': [852, 1209], '8': [852, 1336], '9': [852, 1477],
  '*': [941, 1209], '0': [941, 1336], '#': [941, 1477],
};
let dtmfCtx;
function playDtmfTone(digit) {
  const pair = DTMF_FREQ[digit];
  if (!pair) return;
  try {
    dtmfCtx = dtmfCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (dtmfCtx.state === 'suspended') dtmfCtx.resume().catch(() => {});
    const t0 = dtmfCtx.currentTime + 0.005;
    const dur = 0.11;
    const master = dtmfCtx.createGain();
    master.connect(dtmfCtx.destination);
    master.gain.setValueAtTime(0.0001, t0);
    master.gain.exponentialRampToValueAtTime(0.22, t0 + 0.006);
    master.gain.setValueAtTime(0.22, t0 + dur - 0.02);
    master.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    pair.forEach(freq => {
      const o = dtmfCtx.createOscillator();
      o.type = 'sine'; o.frequency.value = freq;
      o.connect(master);
      o.start(t0); o.stop(t0 + dur + 0.02);
    });
  } catch {}
}

/* ============================================================
   NAVIGATION
   ============================================================ */

const LIST_SCREENS = ['messages', 'recents', 'contacts', 'insights', 'voicemail', 'team'];

function setThreadOpenMobile(open) {
  $('#pane-thread').classList.toggle('open', open);
  if (!isDesktop()) $('#tabs').classList.toggle('hidden-by-thread', open);
}

function show(screen) {
  state.screen = screen;

  const listTarget = LIST_SCREENS.includes(screen) ? screen : null;
  LIST_SCREENS.forEach(s => {
    const el = $('#section-' + s);
    if (el) el.hidden = (s !== (listTarget || 'messages'));
  });

  $$('#sb-nav button[data-screen], #tabs button[data-screen]').forEach(b =>
    b.classList.toggle('active', b.dataset.screen === screen));

  if (isDesktop()) {
    $('#pane-list').classList.remove('closed');
    $('#pane-dial').classList.remove('open');
    setThreadOpenMobile(false);
  } else {
    const kp = (screen === 'keypad');
    $('#pane-dial').classList.toggle('open', kp);
    $('#pane-list').classList.toggle('closed', kp);
    setThreadOpenMobile(false);
  }

  if (screen === 'messages' || (isDesktop() && !listTarget)) loadThreads();
  if (screen === 'contacts') loadContacts();
  if (screen === 'recents')  loadCalls();
  if (screen === 'insights') renderInsights();
  if (screen === 'voicemail') loadVoicemails();
  if (screen === 'team') loadTeam();
}

$$('#sb-nav button[data-screen], #tabs button[data-screen]').forEach(b =>
  b.addEventListener('click', () => show(b.dataset.screen)));

mqDesktop.addEventListener?.('change', () => show(state.screen));

/* ============================================================
   PINNED THREADS  +  DRAFTS
   ============================================================ */

const pins = {
  all() { return store.get('pins', []); },
  has(p) { return this.all().includes(p); },
  toggle(p) {
    const a = this.all();
    const i = a.indexOf(p);
    if (i >= 0) a.splice(i, 1); else a.unshift(p);
    store.set('pins', a);
    return i < 0;
  },
};

const drafts = {
  all() { return store.get('drafts', {}); },
  get(p) { return this.all()[p] || ''; },
  set(p, v) {
    const d = this.all();
    if (v && v.trim()) d[p] = v; else delete d[p];
    store.set('drafts', d);
  },
};

/* ============================================================
   THREADS
   ============================================================ */

function skeletonList(n = 6) {
  return Array.from({ length: n }, () => `
    <div class="skel">
      <div class="skel-av"></div>
      <div class="skel-l">
        <div class="skel-line" style="width:42%"></div>
        <div class="skel-line" style="width:76%;height:8px"></div>
      </div>
    </div>`).join('');
}

async function loadThreads() {
  const el = $('#thread-list');
  if (!state.threads.length && el && !el.children.length) el.innerHTML = skeletonList();
  const j = await api('api/messages.php?action=threads');
  if (!j.ok) return;
  const unchanged = sameData(state.threads, j.threads);
  state.threads = j.threads;
  if (!unchanged) renderThreads();
  updateBadge();
  runScheduled();
}

function sortedThreads(rows) {
  const p = pins.all();
  return rows.slice().sort((a, b) => {
    const pa = p.indexOf(a.phone), pb = p.indexOf(b.phone);
    const ia = pa < 0 ? 9999 : pa, ib = pb < 0 ? 9999 : pb;
    if (ia !== ib) return ia - ib;
    return 0;
  });
}

function renderThreads() {
  const el = $('#thread-list');
  const q = state.threadQuery.toLowerCase();
  let rows = q
    ? state.threads.filter(t =>
        (t.display || '').toLowerCase().includes(q) ||
        (t.phone || '').includes(q.replace(/[^0-9+]/g, '') || '§') ||
        (t.last_body || '').toLowerCase().includes(q))
    : state.threads;

  // filter-tab counts always reflect the full set, not the search query
  const unreadN = state.threads.filter(t => Number(t.unread) > 0).length;
  const pinnedN = state.threads.filter(t => pins.has(t.phone)).length;
  const setN = (id, n) => { const e = $(id); if (e) e.textContent = String(n); };
  setN('#filt-all-n', state.threads.length);
  setN('#filt-unread-n', unreadN);
  setN('#filt-pinned-n', pinnedN);

  if (state.threadFilter === 'unread') rows = rows.filter(t => Number(t.unread) > 0);
  if (state.threadFilter === 'pinned') rows = rows.filter(t => pins.has(t.phone));

  rows = sortedThreads(rows);

  const cnt = $('#msg-count');
  if (cnt) cnt.textContent = state.threads.length ? String(state.threads.length) : '';

  if (!state.threads.length) {
    el.innerHTML = `<div class="empty">
        <div class="empty-glyph"><svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></div>
        <p>No conversations yet</p>
        <small>Anyone who texts your line shows up here.</small>
        <button class="link-btn" data-new-msg>Send the first message</button>
      </div>`;
    return;
  }
  if (!rows.length) {
    el.innerHTML = `<div class="empty">
      <p>${state.threadQuery ? `Nothing matches “${esc(state.threadQuery)}”` : 'Nothing here'}</p>
      <small>${state.threadQuery ? 'Try a name, a number, or a word from the message.' : (state.threadFilter === 'unread' ? 'You are all caught up.' : 'Pin a conversation to see it here.')}</small>
    </div>`;
    return;
  }

  const dr = drafts.all();

  el.innerHTML = rows.map((t, i) => {
    const pinned = pins.has(t.phone);
    const draft = dr[t.phone];
    const sub = draft
      ? `<span style="color:var(--warn)">Draft:</span> ${esc(draft)}`
      : `${t.last_direction === 'outbound' ? 'You: ' : ''}${esc(t.last_body || '')}`;
    return `
    <div class="row ${t.phone === state.activePhone ? 'selected' : ''}" data-phone="${esc(t.phone)}"
         style="animation-delay:${Math.min(i * 18, 220)}ms">
      ${avatarHTML(t.name, t.phone)}
      <div class="row-main">
        <div class="row-top">
          <div class="row-name ${t.unread > 0 ? 'bold' : ''}">${esc(t.display)}</div>
          ${pinned ? '<svg class="pin-mark" viewBox="0 0 24 24"><path d="M12 17v5M9 3h6l-1 7 4 3H6l4-3-1-7z"/></svg>' : ''}
          <div class="row-time">${esc(timeAgo(t.last_at))}</div>
        </div>
        <div class="row-sub ${t.unread > 0 ? 'unread' : ''}">${sub}</div>
      </div>
      ${t.unread > 0 ? '<div class="dot"></div>' : ''}
    </div>`;
  }).join('');
}

$('#thread-search').addEventListener('input', e => {
  state.threadQuery = e.target.value.trim();
  renderThreads();
});

$('#msg-filter-tabs').addEventListener('click', e => {
  const b = e.target.closest('[data-filter]');
  if (!b) return;
  state.threadFilter = b.dataset.filter;
  $$('#msg-filter-tabs button').forEach(x => x.classList.toggle('active', x === b));
  renderThreads();
});

function updateBadge() {
  const n = state.threads.reduce((a, t) => a + Number(t.unread || 0), 0);
  $$('[data-badge]').forEach(b => {
    if (n > 0) { b.textContent = n > 99 ? '99+' : n; b.hidden = false; }
    else b.hidden = true;
  });
  try {
    if (navigator.setAppBadge) n > 0 ? navigator.setAppBadge(n) : navigator.clearAppBadge();
  } catch {}
  document.title = n > 0 ? `(${n}) Console` : 'Console';
}

/* ============================================================
   CHROME — sidebar / top bar interactive bits
   ============================================================ */

$('#sb-quickcall').onclick = () => show('keypad');

$('#tb-bell').onclick = () => {
  show('messages');
  state.threadFilter = 'unread';
  $$('#msg-filter-tabs button').forEach(x => x.classList.toggle('active', x.dataset.filter === 'unread'));
  renderThreads();
};

$('#callas-btn').onclick = () => {
  toast('This dialer is configured with a single outbound line — set in config.php.');
};

/* two profile menus (sidebar footer + top bar) share the same actions */
function wireProfileMenu(btnId, menuId) {
  const btn = $(btnId), menu = $(menuId);
  if (!btn || !menu) return;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const opening = menu.hidden;
    $$('.sb-menu').forEach(m => { m.hidden = true; });
    menu.hidden = !opening;
  });
}
wireProfileMenu('#sb-profile-btn', '#sb-menu');
wireProfileMenu('#tb-profile-btn', '#tb-menu');
document.addEventListener('click', () => { $$('.sb-menu').forEach(m => { m.hidden = true; }); });

on('#sb-audio', 'click', () => $('#audio-settings').click());
on('#tb-audio', 'click', () => $('#audio-settings').click());
on('#sb-export', 'click', () => exportData());
on('#tb-export', 'click', () => exportData());
on('#sb-logout', 'click', () => { location.href = 'logout.php'; });
on('#tb-logout', 'click', () => { location.href = 'logout.php'; });

$('#thread-list').addEventListener('click', e => {
  if (e.target.closest('[data-new-msg]')) return openNewMessage();
  const row = e.target.closest('.row[data-phone]');
  if (row) openThread(row.dataset.phone);
});

function setThreadSubline(phone, hasName) {
  const link = $('#thread-add-contact');
  const num = $('#thread-number');
  if (hasName) {
    link.hidden = true;
    num.hidden = false;
    num.textContent = pretty(phone);
  } else {
    link.hidden = false;
    num.hidden = true;
  }
}
$('#thread-add-contact').addEventListener('click', (e) => {
  e.preventDefault();
  if (state.activePhone) openContactSheet({ phone: state.activePhone });
});

async function openThread(phone) {
  // save the draft of the thread we are leaving
  if (state.activePhone && state.activePhone !== phone) {
    drafts.set(state.activePhone, $('#composer-input').value);
  }

  state.activePhone = phone;

  const t = state.threads.find(x => x.phone === phone);
  const c = state.contacts.find(x => x.phone === phone);
  const nm = t?.display || c?.name || pretty(phone);
  $('#thread-name').textContent = nm;
  setThreadSubline(phone, !!(t?.name || c?.name));

  const av = $('#thread-avatar');
  av.textContent = initials(t?.name || c?.name, phone);
  av.style.setProperty('--av-bg', avColor(phone));

  $('#thread-placeholder').hidden = true;
  $('#thread-view').hidden = false;
  $('#thread-menu').hidden = true;
  $('#tm-pin-label').textContent = pins.has(phone) ? 'Unpin' : 'Pin to top';

  // restore draft
  const ta = $('#composer-input');
  ta.value = drafts.get(phone);
  autoGrow(ta);
  renderSchedBar();

  if (msgCache[phone]) {
    currentMsgs = msgCache[phone];
    renderBubbles(currentMsgs);
  } else {
    $('#bubbles').innerHTML = skeletonList(4);
  }
  if (t && t.unread > 0) { t.unread = 0; }
  prevUnreadMap[phone] = 0;
  renderThreads(); updateBadge();

  if (!isDesktop()) setThreadOpenMobile(true);
  else ta.focus();

  const j = await api('api/messages.php?action=thread&phone=' + encodeURIComponent(phone));
  if (!j.ok) return toast(j.error, 'err');
  if (state.activePhone !== phone) return;
  const unchanged = msgCache[phone] && sameData(msgCache[phone], j.messages);
  msgCache[phone] = j.messages;
  currentMsgs = j.messages;
  $('#thread-name').textContent = j.display;
  setThreadSubline(j.phone, !!j.name);
  if (!unchanged) renderBubbles(j.messages);
}

async function prefetchThreads() {
  const top = sortedThreads(state.threads).slice(0, 12);
  for (const t of top) {
    if (msgCache[t.phone]) continue;
    try {
      const j = await api('api/messages.php?action=thread&phone=' + encodeURIComponent(t.phone));
      if (j.ok) msgCache[t.phone] = j.messages;
    } catch {}
    await new Promise(r => setTimeout(r, 150));
  }
}

function closeThreadMobile() {
  if (state.activePhone) drafts.set(state.activePhone, $('#composer-input').value);
  setThreadOpenMobile(false);
  state.activePhone = null;
  renderThreads();
  loadThreads();
}

$('#thread-back').onclick = closeThreadMobile;

$('#thread-menu-btn').onclick = (e) => {
  e.stopPropagation();
  const m = $('#thread-menu');
  m.hidden = !m.hidden;
};
document.addEventListener('click', () => { $('#thread-menu').hidden = true; });

$('#thread-menu').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-tm]');
  if (!b || !state.activePhone) return;
  const phone = state.activePhone;
  const act = b.dataset.tm;
  $('#thread-menu').hidden = true;

  if (act === 'people') {
    const c = state.contacts.find(x => x.phone === phone);
    return openContactSheet(c || { phone });
  }
  if (act === 'pin') {
    const nowPinned = pins.toggle(phone);
    $('#tm-pin-label').textContent = nowPinned ? 'Unpin' : 'Pin to top';
    renderThreads();
    if (state.dialTab === 'favorites') renderDialFavorites();
    return toast(nowPinned ? 'Pinned to top' : 'Unpinned', 'good');
  }
  if (act === 'copy') {
    try { await navigator.clipboard.writeText(phone); toast('Number copied', 'good'); }
    catch { toast('Could not copy the number.', 'err'); }
    return;
  }
  if (act === 'delete' && !confirm('Delete this entire conversation? This cannot be undone.')) return;
  if (act === 'block' && !confirm('Block ' + pretty(phone) + '? Their texts will no longer reach you.')) return;

  const map = { archive: 'archive', spam: 'block', block: 'block', delete: 'delete_thread' };
  const j = await postJSON('api/messages.php?action=' + map[act], { phone });
  if (!j.ok) return toast(j.error, 'err');

  delete msgCache[phone];
  drafts.set(phone, '');
  toast(act === 'archive' ? 'Conversation archived'
      : act === 'delete'  ? 'Conversation deleted'
      : act === 'spam'    ? 'Marked as spam and blocked'
      : 'Number blocked', 'good');

  state.activePhone = null;
  $('#thread-view').hidden = true;
  $('#thread-placeholder').hidden = false;
  if (!isDesktop()) closeThreadMobile(); else loadThreads();
});

$('#thread-call').onclick = () => { if (state.activePhone) startCall(state.activePhone); };

function renderBubbles(msgs, pendingText) {
  const el = $('#bubbles');
  const stick = el.scrollHeight - el.scrollTop - el.clientHeight < 140 || !el.dataset.init;
  let html = '', lastDay = '';

  msgs.forEach((m, i) => {
    const d = parseTime(m.created_at);
    const day = d.toDateString();
    if (day !== lastDay) {
      lastDay = day;
      const label = day === new Date().toDateString()
        ? 'Today'
        : d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric',
            year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined });
      html += `<div class="day-sep">${esc(label)}</div>`;
    }

    const out = m.direction === 'outbound';
    const failed = m.status === 'failed';
    const isNote = out && /^\u{1F4DD}/u.test(m.body || '');
    html += `<div class="bubble ${out ? 'out' : 'in'} ${failed ? 'failed' : ''}">${esc(m.body)}</div>`;

    const next = msgs[i + 1];
    if (!next || next.direction !== m.direction) {
      const t = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      let status = '';
      if (out) {
        if (failed) status = ` · Not delivered<span class="retry" data-retry="${esc(m.body)}">Try again</span>`;
        else if (m.status === 'delivered') status = ' · Delivered<span class="tick d">✓✓</span>';
        else if (m.status === 'sending') status = ' · Sending';
        else status = ' · Sent<span class="tick">✓</span>';
      }
      html += `<div class="meta ${out ? 'out' : 'in'}">${esc(t)}${status}</div>`;
    }
  });

  if (pendingText) {
    html += `<div class="bubble out pending">${esc(pendingText)}</div>
             <div class="meta out">Sending<span class="sending-dots"><i></i><i></i><i></i></span></div>`;
  }

  el.innerHTML = html;
  el.dataset.init = '1';
  if (stick) el.scrollTop = el.scrollHeight;
}

$('#bubbles').addEventListener('click', e => {
  const r = e.target.closest('[data-retry]');
  if (r) { const t = $('#composer-input'); t.value = r.dataset.retry; t.focus(); autoGrow(t); }
});

/* ============================================================
   COMPOSER
   ============================================================ */

const ta = $('#composer-input');
function autoGrow(el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 132) + 'px'; }

ta.addEventListener('input', () => {
  autoGrow(ta);
  const n = ta.value.length;
  const note = $('#char-note');
  if (n > 1300) {
    note.hidden = false;
    note.className = 'char-note' + (n > 1550 ? ' warn' : '');
    note.textContent = `${1600 - n} characters left`;
  } else note.hidden = true;
  if (state.activePhone) drafts.set(state.activePhone, ta.value);
});

ta.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey && isDesktop()) {
    e.preventDefault(); $('#composer').requestSubmit();
  }
});

window.addEventListener('beforeunload', () => {
  if (state.activePhone) drafts.set(state.activePhone, ta.value);
});

async function sendMessage(phone, text) {
  const j = await postJSON('api/send.php', { to: phone, text });
  if (state.activePhone === phone) {
    const r = await api('api/messages.php?action=thread&phone=' + encodeURIComponent(phone));
    if (r.ok) { msgCache[phone] = r.messages; currentMsgs = r.messages; renderBubbles(r.messages); }
  }
  loadThreads();
  return j;
}

$('#composer').addEventListener('submit', async e => {
  e.preventDefault();
  const text = ta.value.trim();
  if (!text || !state.activePhone) return;
  if (text.length > 1600) return toast('Message is too long — keep it under 1600 characters.', 'err');

  const phone = state.activePhone;

  // scheduled send?
  const when = pendingSchedule;
  if (when) {
    schedule.add({ phone, text, at: when });
    pendingSchedule = null;
    ta.value = ''; autoGrow(ta); drafts.set(phone, '');
    $('#char-note').hidden = true;
    renderSchedBar();
    return toast('Scheduled for ' + fmtWhen(when), 'good');
  }

  ta.value = ''; autoGrow(ta); $('#char-note').hidden = true;
  drafts.set(phone, '');

  renderBubbles(currentMsgs, text);
  haptic(10);

  const j = await sendMessage(phone, text);
  if (!j.ok) toast(j.error || 'Message did not send. Use “Try again” on it.', 'err');
});

async function refreshThreadQuiet(phone) {
  const j = await api('api/messages.php?action=thread&phone=' + encodeURIComponent(phone));
  if (j.ok) {
    const unchanged = sameData(msgCache[phone], j.messages);
    msgCache[phone] = j.messages;
    currentMsgs = j.messages;
    if (!unchanged) renderBubbles(j.messages);
  }
}

/* ============================================================
   SAVED REPLIES  ({name} expands to the contact's first name)
   ============================================================ */

const DEFAULT_TEMPLATES = [
  { label: 'On my way',   body: "Hi {name}, I'm on my way — see you shortly." },
  { label: 'Running late', body: "Hi {name}, running about 10 minutes behind. Thanks for your patience." },
  { label: 'Call me back', body: "Hi {name}, give me a call when you have a moment." },
  { label: 'Thanks',      body: "Thanks {name}, much appreciated!" },
];

const templates = {
  all() { return store.get('templates', DEFAULT_TEMPLATES); },
  save(list) { store.set('templates', list); },
};

function expand(body, phone) {
  const n = nameFor(phone);
  const first = n ? n.trim().split(/\s+/)[0] : 'there';
  return body.replace(/\{name\}/gi, first);
}

$('#btn-templates').onclick = () => {
  const list = templates.all();
  const rows = list.map((t, i) => `
    <div class="tpl-row">
      <div class="tr-main">
        <div class="tr-label">${esc(t.label)}</div>
        <div class="tr-body">${esc(t.body)}</div>
      </div>
      <button class="icon-btn" data-use="${i}" title="Insert">
        <svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
      </button>
      <button class="icon-btn" data-del="${i}" title="Delete">
        <svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>
      </button>
    </div>`).join('');

  openSheet('Saved replies', `
    ${rows || '<div class="empty"><p>No saved replies yet</p><small>Save the lines you send over and over.</small></div>'}
    <label style="margin-top:18px">New reply
      <input id="tp-label" placeholder="Short name, e.g. Running late" autocomplete="off">
      <textarea id="tp-body" rows="3" placeholder="Message text — use {name} for the contact's first name"></textarea>
      <div class="field-hint">{name} becomes the contact's first name when you insert it.</div>
    </label>
    <button class="btn-primary" id="tp-add">Save reply</button>
  `);

  $('#sheet-body').addEventListener('click', (e) => {
    const u = e.target.closest('[data-use]');
    const d = e.target.closest('[data-del]');
    if (u) {
      const t = templates.all()[Number(u.dataset.use)];
      const cur = ta.value;
      ta.value = (cur ? cur.replace(/\s*$/, ' ') : '') + expand(t.body, state.activePhone);
      autoGrow(ta); closeSheet(); ta.focus();
      if (state.activePhone) drafts.set(state.activePhone, ta.value);
    }
    if (d) {
      const list = templates.all();
      list.splice(Number(d.dataset.del), 1);
      templates.save(list);
      closeSheet();
      toast('Reply deleted');
    }
  });

  $('#tp-add').onclick = () => {
    const label = $('#tp-label').value.trim();
    const body  = $('#tp-body').value.trim();
    if (!label || !body) return toast('Give the reply a name and some text.', 'err');
    const list = templates.all();
    list.push({ label, body });
    templates.save(list);
    closeSheet();
    toast('Reply saved', 'good');
  };
};

/* ============================================================
   SCHEDULED SEND
   ============================================================ */

let pendingSchedule = null;

const schedule = {
  all() { return store.get('scheduled', []); },
  add(item) { const a = this.all(); a.push({ ...item, id: Date.now() + '' + Math.random() }); store.set('scheduled', a); },
  remove(id) { store.set('scheduled', this.all().filter(x => x.id !== id)); },
};

function fmtWhen(ts) {
  const d = new Date(ts), now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const t = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return sameDay ? `today at ${t}` : `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${t}`;
}

function renderSchedBar() {
  const bar = $('#sched-bar');
  const mine = schedule.all().filter(s => s.phone === state.activePhone);
  if (pendingSchedule) {
    bar.hidden = false;
    $('#sched-label').textContent = 'This message will send ' + fmtWhen(pendingSchedule);
  } else if (mine.length) {
    bar.hidden = false;
    $('#sched-label').textContent = mine.length === 1
      ? '1 message waiting to send ' + fmtWhen(mine[0].at)
      : `${mine.length} messages waiting to send`;
  } else {
    bar.hidden = true;
  }
}

$('#sched-cancel').onclick = () => {
  if (pendingSchedule) { pendingSchedule = null; renderSchedBar(); return toast('Schedule cancelled'); }
  const mine = schedule.all().filter(s => s.phone === state.activePhone);
  mine.forEach(m => schedule.remove(m.id));
  renderSchedBar();
  toast('Scheduled messages cancelled');
};

$('#btn-schedule').onclick = () => {
  if (!state.activePhone) return toast('Open a conversation first.', 'err');
  if (!ta.value.trim()) return toast('Type the message you want to send later.', 'err');

  const now = new Date();
  const opt = (mins, label) => {
    const d = new Date(now.getTime() + mins * 60000);
    return `<button class="btn-ghost" data-in="${d.getTime()}">${label} — ${fmtWhen(d.getTime())}</button>`;
  };
  const tomorrow9 = new Date(now); tomorrow9.setDate(now.getDate() + 1); tomorrow9.setHours(9, 0, 0, 0);

  openSheet('Send later', `
    <div class="field-hint" style="margin-bottom:14px">
      Scheduled messages send from this browser, so leave the app open at that time.
    </div>
    ${opt(30, 'In 30 minutes')}
    ${opt(120, 'In 2 hours')}
    <button class="btn-ghost" data-in="${tomorrow9.getTime()}">Tomorrow morning — ${fmtWhen(tomorrow9.getTime())}</button>
    <label style="margin-top:18px">Pick a time
      <input type="datetime-local" id="sc-when">
    </label>
    <button class="btn-primary" id="sc-set">Schedule it</button>
  `);

  $('#sheet-body').addEventListener('click', e => {
    const b = e.target.closest('[data-in]');
    if (!b) return;
    pendingSchedule = Number(b.dataset.in);
    closeSheet(); renderSchedBar();
    toast('Press send to confirm', 'good');
  });

  $('#sc-set').onclick = () => {
    const v = $('#sc-when').value;
    if (!v) return toast('Pick a date and time first.', 'err');
    const t = new Date(v).getTime();
    if (t < Date.now()) return toast('Pick a time in the future.', 'err');
    pendingSchedule = t;
    closeSheet(); renderSchedBar();
    toast('Press send to confirm', 'good');
  };
};

async function runScheduled() {
  const due = schedule.all().filter(s => s.at <= Date.now());
  for (const s of due) {
    schedule.remove(s.id);
    const j = await sendMessage(s.phone, s.text);
    toast(j.ok ? 'Scheduled message sent to ' + displayFor(s.phone)
               : 'A scheduled message failed to send.', j.ok ? 'good' : 'err');
  }
  if (due.length) renderSchedBar();
}
setInterval(runScheduled, 30000);

/* ============================================================
   SHEETS
   ============================================================ */

function openSheet(title, html) {
  $('#sheet-title').textContent = title;
  const body = $('#sheet-body');
  body.replaceWith(body.cloneNode(false));   // drop old listeners
  $('#sheet-body').innerHTML = html;
  $('#sheet-backdrop').hidden = false;
}
function closeSheet() { $('#sheet-backdrop').hidden = true; }

$('#sheet-close').onclick = closeSheet;
$('#sheet-backdrop').addEventListener('click', e => {
  if (e.target.id === 'sheet-backdrop') closeSheet();
});

function openNewMessage(prefill) {
  openSheet('New message', `
    <label>To
      <input id="nm-phone" inputmode="tel" placeholder="(555) 123-4567"
             value="${esc(prefill || '')}" autocomplete="off">
    </label>
    <label>Message
      <textarea id="nm-text" rows="3" placeholder="Type your message"></textarea>
    </label>
    <button class="btn-primary" id="nm-send">Send</button>
  `);
  setTimeout(() => (prefill ? $('#nm-text') : $('#nm-phone')).focus(), 120);

  $('#nm-send').onclick = async () => {
    const to = normalize($('#nm-phone').value);
    const text = $('#nm-text').value.trim();
    if (to.length < 8) return toast('That phone number does not look right.', 'err');
    if (!text) return toast('Type a message first.', 'err');

    $('#nm-send').disabled = true;
    $('#nm-send').textContent = 'Sending…';
    const j = await postJSON('api/send.php', { to, text });
    $('#nm-send').disabled = false;
    $('#nm-send').textContent = 'Send';

    if (!j.ok) return toast(j.error, 'err');
    closeSheet();
    if (!isDesktop()) show('messages');
    await loadThreads();
    openThread(to);
  };
}

$('#btn-new-message').onclick = () => openNewMessage();

/* ============================================================
   KEYPAD
   ============================================================ */

const kpInput = $('#keypad-number');

function kpUpdate() {
  const raw = kpInput.value.trim();
  const n = normalize(raw);
  const c = state.contacts.find(c => c.phone === n);
  const hint = $('#keypad-hint');
  if (c && c.name) hint.textContent = c.name;
  else if (raw.length >= 3 && !/^[\d+*#\s()-]+$/.test(raw)) {
    const match = state.contacts.filter(x => (x.name || '').toLowerCase().includes(raw.toLowerCase()));
    hint.textContent = match.length ? match.slice(0, 2).map(m => m.name).join(' · ') : '';
  } else hint.textContent = '';
  $('#dial-input-row').classList.toggle('has-value', raw.length > 0);
}

$('#keypad').addEventListener('click', e => {
  const b = e.target.closest('button[data-k]');
  if (!b) return;
  kpInput.value += b.dataset.k;
  kpUpdate();
  playDtmfTone(b.dataset.k);
  haptic(8);
  if (state.call && rtcCall) { try { rtcCall.dtmf(b.dataset.k); } catch {} }
});

let bsTimer;
$('#keypad-back').addEventListener('pointerdown', () => {
  bsTimer = setTimeout(() => { kpInput.value = ''; kpUpdate(); haptic(20); }, 550);
});
['pointerup', 'pointerleave'].forEach(ev =>
  $('#keypad-back').addEventListener(ev, () => clearTimeout(bsTimer)));
$('#keypad-back').onclick = () => { kpInput.value = kpInput.value.slice(0, -1); kpUpdate(); };

let kpPrevValue = '';
kpInput.addEventListener('input', e => {
  kpUpdate();
  const val = kpInput.value;
  if (val.length > kpPrevValue.length) {
    const added = e.data || val.slice(kpPrevValue.length);
    for (const ch of added) { if (DTMF_FREQ[ch]) playDtmfTone(ch); }
  }
  kpPrevValue = val;
});
kpInput.addEventListener('keydown', e => { if (e.key === 'Enter') dialFromKeypad(); });

function dialFromKeypad() {
  const raw = kpInput.value.trim();
  const byName = state.contacts.find(c =>
    (c.name || '').toLowerCase() === raw.toLowerCase() && raw !== '');
  const partial = !byName && raw.length >= 3 && !/^[\d+*#\s()-]+$/.test(raw)
    ? state.contacts.find(c => (c.name || '').toLowerCase().startsWith(raw.toLowerCase()))
    : null;
  const n = byName ? byName.phone : partial ? partial.phone : normalize(raw);
  if (n.length < 8) return toast('Enter a full phone number first.', 'err');
  startCall(n);
}

$('#keypad-call').onclick = dialFromKeypad;

$('#keypad-add-contact').onclick = () => {
  const n = normalize(kpInput.value);
  if (n.length < 8) return toast('Enter a full phone number first.', 'err');
  openContactSheet({ phone: n });
};

/* ============================================================
   CONTACTS
   ============================================================ */

async function loadContacts() {
  const j = await api('api/contacts.php?action=list');
  if (!j.ok) return;
  const unchanged = sameData(state.contacts, j.contacts);
  state.contacts = j.contacts;
  if (!unchanged) renderContacts();
}

function renderContacts() {
  const el = $('#contact-list');
  const q = state.contactQuery.toLowerCase();
  const rows = q
    ? state.contacts.filter(c =>
        (c.display || '').toLowerCase().includes(q) ||
        (c.phone || '').includes(q.replace(/[^0-9+]/g, '') || '§'))
    : state.contacts;

  const cnt = $('#contact-count');
  if (cnt) cnt.textContent = state.contacts.length ? String(state.contacts.length) : '';

  if (!state.contacts.length) {
    el.innerHTML = `<div class="empty">
        <div class="empty-glyph"><svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>
        <p>No contacts yet</p>
        <small>Save a name against a number so you know who is calling.</small>
        <button class="link-btn" data-new-contact>Add a contact</button>
      </div>`;
    return;
  }
  if (!rows.length) {
    el.innerHTML = `<div class="empty"><p>Nothing matches “${esc(state.contactQuery)}”</p></div>`;
    return;
  }

  el.innerHTML = rows.map((c, i) => `
    <div class="row" data-contact="${esc(c.phone)}" style="animation-delay:${Math.min(i * 15, 200)}ms">
      ${avatarHTML(c.name, c.phone)}
      <div class="row-main">
        <div class="row-top">
          <div class="row-name" style="flex:1">${esc(c.display)}</div>
          ${pins.has(c.phone) ? '<svg class="pin-mark" viewBox="0 0 24 24" style="fill:currentColor"><path d="M12 17v5M9 3h6l-1 7 4 3H6l4-3-1-7z"/></svg>' : ''}
        </div>
        <div class="row-sub">${esc(c.name ? pretty(c.phone) : '')}</div>
      </div>
      <div class="row-actions">
        <button class="icon-btn" data-act="fav" title="${pins.has(c.phone) ? 'Remove from favorites' : 'Add to favorites'}" style="${pins.has(c.phone) ? 'color:var(--warn)' : ''}">
          <svg viewBox="0 0 24 24" style="${pins.has(c.phone) ? 'fill:currentColor' : ''}"><path d="M12 17v5M9 3h6l-1 7 4 3H6l4-3-1-7z"/></svg>
        </button>
        <button class="icon-btn" data-act="text" title="Text">
          <svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        </button>
        <button class="icon-btn" data-act="call" title="Call">
          <svg viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
        </button>
      </div>
    </div>`).join('');
}

$('#contact-search').addEventListener('input', e => {
  state.contactQuery = e.target.value.trim();
  renderContacts();
});

$('#contact-list').addEventListener('click', e => {
  if (e.target.closest('[data-new-contact]')) return openContactSheet();
  const row = e.target.closest('.row[data-contact]');
  if (!row) return;
  const phone = row.dataset.contact;
  const act = e.target.closest('[data-act]')?.dataset.act;

  if (act === 'fav') {
    const nowPinned = pins.toggle(phone);
    renderContacts();
    if (state.dialTab === 'favorites') renderDialFavorites();
    return toast(nowPinned ? 'Added to favorites' : 'Removed from favorites', 'good');
  }
  if (act === 'text') { if (!isDesktop()) show('messages'); return openThread(phone); }
  if (act === 'call') return startCall(phone);
  openContactSheet(state.contacts.find(c => c.phone === phone));
});

function openContactSheet(contact) {
  const c = contact || {};
  const isSaved = !!(contact && contact.id);
  const callNotes = (store.get('callnotes', {})[c.phone] || []).slice().reverse();
  const notesHTML = callNotes.length ? `
    <label>Call notes on this device</label>
    ${callNotes.map(n => `
      <div class="tpl-row" style="align-items:flex-start">
        <div class="tr-main">
          <div class="tr-body" style="white-space:normal;overflow:visible">${esc(n.text)}</div>
          <div class="tr-label" style="margin-top:4px;font-weight:500;color:var(--tx-4)">${esc(new Date(n.at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }))}</div>
        </div>
      </div>`).join('')}
  ` : '';

  openSheet(isSaved ? 'Edit contact' : 'New contact', `
    <label>Name
      <input id="ct-name" value="${esc(c.name || '')}" placeholder="Client name" autocomplete="off">
    </label>
    <label>Phone number
      <input id="ct-phone" inputmode="tel" value="${esc(c.phone || '')}" placeholder="(555) 123-4567"
             ${isSaved ? 'readonly' : ''} autocomplete="off">
    </label>
    <label>Notes
      <textarea id="ct-notes" rows="3" placeholder="Anything worth remembering">${esc(c.notes || '')}</textarea>
    </label>
    <button class="btn-primary" id="ct-save">Save contact</button>
    ${isSaved ? '<button class="btn-danger" id="ct-del">Delete contact</button>' : ''}
    ${notesHTML}
  `);

  $('#ct-save').onclick = async () => {
    const savedPhone = normalize($('#ct-phone').value);
    const savedName = $('#ct-name').value.trim();
    const j = await postJSON('api/contacts.php?action=save', {
      phone: savedPhone,
      name:  savedName,
      notes: $('#ct-notes').value.trim(),
    });
    if (!j.ok) return toast(j.error, 'err');
    closeSheet();
    toast('Contact saved', 'good');
    await loadContacts();
    loadThreads();
    if (state.activePhone === savedPhone) {
      $('#thread-name').textContent = savedName || pretty(savedPhone);
      setThreadSubline(savedPhone, !!savedName);
      const av = $('#thread-avatar');
      av.textContent = initials(savedName, savedPhone);
      av.style.setProperty('--av-bg', avColor(savedPhone));
    }
  };

  const del = $('#ct-del');
  if (del) del.onclick = async () => {
    if (!confirm('Delete this contact? Messages stay.')) return;
    await postJSON('api/contacts.php?action=delete', { phone: c.phone });
    closeSheet();
    toast('Contact deleted');
    loadContacts();
  };
}

$('#btn-new-contact').onclick = () => openContactSheet();

/* ============================================================
   RECENTS
   ============================================================ */

async function loadCalls() {
  const j = await api('api/calls.php?action=history');
  if (!j.ok) return;
  state.calls = j.calls;
  const el = $('#call-list');

  const cnt = $('#call-count');
  if (cnt) cnt.textContent = j.calls.length ? String(j.calls.length) : '';

  if (!j.calls.length) {
    el.innerHTML = `<div class="empty">
        <div class="empty-glyph"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg></div>
        <p>No calls yet</p>
        <small>Dialled and received calls are logged here.</small>
      </div>`;
    return;
  }

  el.innerHTML = j.calls.map((c, i) => {
    const missed = c.direction === 'inbound' && c.status !== 'answered' && c.status !== 'completed';
    const arrow = c.direction === 'outbound'
      ? '<path d="M7 17 17 7M7 7h10v10"/>'
      : '<path d="M17 7 7 17M17 17H7V7"/>';
    return `
      <div class="row" data-call="${esc(c.phone)}" style="animation-delay:${Math.min(i * 14, 200)}ms">
        ${avatarHTML(c.name, c.phone)}
        <div class="row-main">
          <div class="row-top">
            <div class="row-name" style="${missed ? 'color:var(--bad)' : ''}">${esc(c.display)}</div>
            <div class="row-time">${esc(timeAgo(c.created_at))}</div>
          </div>
          <div class="row-sub">
            <svg viewBox="0 0 24 24" class="${missed ? 'miss' : ''}">${arrow}</svg>
            <span class="dur">${c.duration > 0 ? esc(clock(c.duration)) : esc(missed ? 'Missed' : (c.status || ''))}</span>
          </div>
        </div>
        <div class="row-actions">
          <button class="icon-btn" data-act="msg" title="Message">
            <svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          </button>
          <button class="icon-btn" data-act="call" title="Call back">
            <svg viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
          </button>
        </div>
      </div>`;
  }).join('');
}

$('#call-list').addEventListener('click', e => {
  const row = e.target.closest('.row[data-call]');
  if (!row) return;
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'call') return startCall(row.dataset.call);
  if (!isDesktop()) show('messages');
  openThread(row.dataset.call);
});

/* ============================================================
   VOICEMAIL
   ============================================================ */

state.voicemails = [];

function updateVmBadge() {
  const n = state.voicemails.filter(v => !v.listened).length;
  $$('[data-vm-badge]').forEach(b => {
    if (n > 0) { b.textContent = n > 9 ? '9+' : n; b.hidden = false; }
    else b.hidden = true;
  });
}

let knownVmIds = null; // null = not seeded yet (avoid notifying for pre-existing voicemail on first load)

async function loadVoicemails() {
  const el = $('#voicemail-list');
  if (!state.voicemails.length && el && !el.children.length) el.innerHTML = skeletonList(3);
  const j = await api('api/voicemails.php?action=list');
  if (!j.ok) return;
  notifyNewVoicemails(j.voicemails);
  const unchanged = sameData(state.voicemails, j.voicemails);
  state.voicemails = j.voicemails;
  updateVmBadge();
  if (!unchanged) renderVoicemails();
}

function notifyNewVoicemails(list) {
  if (knownVmIds === null) {
    knownVmIds = new Set(list.map(v => v.id));
    return;
  }
  const isViewingVm = state.screen === 'voicemail' && !document.hidden;
  list.forEach(v => {
    if (knownVmIds.has(v.id)) return;
    knownVmIds.add(v.id);
    try {
      if (!isViewingVm) {
        showMsgToast(v.display, v.phone, v.duration ? clock(v.duration) + ' voicemail' : 'New voicemail', v.name, 'voicemail');
        playMsgChime();
      }
      if (tabIsAway()) {
        systemNotify('New voicemail', v.display + ' left a message', { phone: v.phone });
        haptic(200);
      }
    } catch (err) { console.error('voicemail notify failed', err); }
  });
}

let vmPollTimer = null;
async function pollVoicemails() {
  try {
    const j = await api('api/voicemails.php?action=list');
    if (j.ok) {
      notifyNewVoicemails(j.voicemails);
      const unchanged = sameData(state.voicemails, j.voicemails);
      state.voicemails = j.voicemails;
      updateVmBadge();
      if (state.screen === 'voicemail' && !unchanged) renderVoicemails();
    }
  } catch (err) { console.error('voicemail poll failed', err); }
  const vmInterval = state.call ? 60000 : (document.hidden ? 45000 : 15000);
  vmPollTimer = setTimeout(pollVoicemails, vmInterval);
}

function renderVoicemails() {
  const el = $('#voicemail-list');
  const cnt = $('#vm-count');
  if (cnt) cnt.textContent = state.voicemails.length ? String(state.voicemails.length) : '';

  if (!state.voicemails.length) {
    el.innerHTML = `<div class="empty">
        <div class="empty-glyph"><svg viewBox="0 0 24 24"><path d="M6 15a5 5 0 1 0 0-6M18 15a5 5 0 1 0 0-6"/><path d="M11 12h2"/></svg></div>
        <p>No voicemail yet</p>
        <small>Missed calls that leave a message will show up here.</small>
      </div>`;
    return;
  }

  el.innerHTML = state.voicemails.map((v, i) => `
    <div class="row vm-row ${v.listened ? '' : 'unheard'}" data-vm="${v.id}" data-phone="${esc(v.phone)}" style="animation-delay:${Math.min(i * 15, 200)}ms">
      ${avatarHTML(v.name, v.phone)}
      <div class="row-main">
        <div class="row-top">
          <div class="row-name ${v.listened ? '' : 'bold'}">${esc(v.display)}</div>
          <div class="row-time">${esc(timeAgo(v.created_at))}</div>
        </div>
        <div class="row-sub">
          <button class="vm-play" data-act="play" title="Play">
            <svg viewBox="0 0 24 24"><path d="M6 4l14 8-14 8z"/></svg>
          </button>
          <span class="vm-scrub" data-act="scrub">
            <span class="vm-scrub-fill"></span>
          </span>
          <span class="vm-time">--:--</span>
        </div>
      </div>
      <div class="row-actions">
        <button class="icon-btn" data-act="call" title="Call back">
          <svg viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
        </button>
        <button class="icon-btn" data-act="download" title="Download">
          <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5M12 15V3"/></svg>
        </button>
        <button class="icon-btn" data-act="delete" title="Delete">
          <svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
        </button>
      </div>
    </div>`).join('');
}

let vmAudio = null;
let vmPlayingId = null;

function vmStopPlayback() {
  if (vmAudio) { try { vmAudio.pause(); } catch {} }
  vmAudio = null;
  if (vmPlayingId) {
    const row = $(`.vm-row[data-vm="${vmPlayingId}"]`);
    if (row) {
      row.querySelector('.vm-play')?.classList.remove('playing');
      const fill = row.querySelector('.vm-scrub-fill');
      if (fill) fill.style.width = '0%';
    }
  }
  vmPlayingId = null;
}

async function vmMarkRead(v) {
  if (v.listened) return;
  v.listened = true;
  updateVmBadge();
  try { await postJSON('api/voicemails.php?action=mark_read', { id: v.id }); } catch {}
}

$('#voicemail-list').addEventListener('click', async e => {
  const row = e.target.closest('.vm-row');
  if (!row) return;
  const id = Number(row.dataset.vm);
  const phone = row.dataset.phone;
  const v = state.voicemails.find(x => x.id === id);
  const act = e.target.closest('[data-act]')?.dataset.act;

  if (act === 'call') return startCall(phone);

  if (act === 'download') {
    toast('Preparing download…');
    const blob = await vmFetchBlob(id);
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'voicemail-' + id + '.mp3';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    if (v) vmMarkRead(v);
    return;
  }

  if (act === 'delete') {
    if (!confirm('Delete this voicemail? This cannot be undone.')) return;
    if (vmPlayingId === id) vmStopPlayback();
    await postJSON('api/voicemails.php?action=delete', { id });
    state.voicemails = state.voicemails.filter(x => x.id !== id);
    updateVmBadge();
    renderVoicemails();
    toast('Voicemail deleted');
    return;
  }

  // play / pause (clicking anywhere on the row toggles, not just the button)
  if (vmPlayingId === id) { vmStopPlayback(); return; }
  vmStopPlayback();
  if (v) vmMarkRead(v);
  row.querySelector('.row-name')?.classList.remove('bold');

  const blob = await vmFetchBlob(id);
  if (!blob) return;

  vmAudio = new Audio(URL.createObjectURL(blob));
  vmPlayingId = id;
  row.querySelector('.vm-play')?.classList.add('playing');
  const fill = row.querySelector('.vm-scrub-fill');
  const timeLabel = row.querySelector('.vm-time');

  vmAudio.addEventListener('timeupdate', () => {
    if (!vmAudio.duration) return;
    if (fill) fill.style.width = (vmAudio.currentTime / vmAudio.duration * 100) + '%';
    if (timeLabel) timeLabel.textContent = clock(Math.floor(vmAudio.currentTime));
  });
  vmAudio.addEventListener('ended', () => { if (vmPlayingId === id) vmStopPlayback(); });
  vmAudio.play().catch(err => {
    console.error('voicemail playback failed', err);
    toast('The recording downloaded but this browser could not play it.', 'err');
    vmStopPlayback();
  });
});

/* Fetches the recording as a blob and shows the server's actual error
   text on failure, instead of a generic message that hides what
   actually went wrong. */
async function vmFetchBlob(id) {
  try {
    const r = await fetch('api/voicemails.php?action=audio&id=' + id);
    if (!r.ok) {
      const text = await r.text().catch(() => '');
      toast(text || `Could not load this voicemail (HTTP ${r.status}).`, 'err');
      return null;
    }
    return await r.blob();
  } catch (err) {
    console.error('voicemail fetch failed', err);
    toast('Could not reach the server to load this voicemail.', 'err');
    return null;
  }
}

/* ============================================================
   TEAM — admin-only user management
   ============================================================ */

state.teamUsers = [];

async function loadTeam() {
  const el = $('#team-list');
  if (!el) return; // non-admins never get this section rendered server-side
  if (!state.teamUsers.length && !el.children.length) el.innerHTML = skeletonList(3);
  const j = await api('api/users.php?action=list');
  if (!j.ok) { el.innerHTML = `<div class="empty"><p>${esc(j.error || 'Could not load the team.')}</p></div>`; return; }
  state.teamUsers = j.users;
  state.myUserId = j.me;
  renderTeam();
}

function renderTeam() {
  const el = $('#team-list');
  if (!el) return;
  const cnt = $('#team-count');
  if (cnt) cnt.textContent = state.teamUsers.length ? String(state.teamUsers.length) : '';

  if (!state.teamUsers.length) {
    el.innerHTML = `<div class="empty">
        <div class="empty-glyph"><svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg></div>
        <p>No one added yet</p>
        <small>Add a person and give them their own number and login.</small>
        <button class="link-btn" data-new-user>Add someone</button>
      </div>`;
    return;
  }

  el.innerHTML = state.teamUsers.map((u, i) => `
    <div class="row team-row ${u.active ? '' : 'inactive'}" data-uid="${u.id}" style="animation-delay:${Math.min(i * 15, 200)}ms">
      ${avatarHTML(u.display_name, u.username)}
      <div class="row-main">
        <div class="row-top">
          <div class="row-name">${esc(u.display_name)}${u.id === state.myUserId ? ' <span class="you-tag">you</span>' : ''}</div>
          ${u.role === 'admin' ? '<span class="role-tag">Admin</span>' : ''}
        </div>
        <div class="row-sub">${u.phone_number ? esc(pretty(u.phone_number)) : 'No number assigned'} ${u.active ? '' : '· Deactivated'}</div>
      </div>
      <div class="row-actions">
        <button class="icon-btn" data-act="edit" title="Edit"><svg viewBox="0 0 24 24"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button>
        ${u.id !== state.myUserId ? `<button class="icon-btn" data-act="toggle" title="${u.active ? 'Deactivate' : 'Reactivate'}">
          <svg viewBox="0 0 24 24">${u.active ? '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>' : '<path d="M20 6 9 17l-5-5"/>'}</svg>
        </button>` : ''}
      </div>
    </div>`).join('');
}

$('#team-list')?.addEventListener('click', async e => {
  if (e.target.closest('[data-new-user]')) return openUserSheet();
  const row = e.target.closest('.team-row');
  if (!row) return;
  const id = Number(row.dataset.uid);
  const u = state.teamUsers.find(x => x.id === id);
  const act = e.target.closest('[data-act]')?.dataset.act;

  if (act === 'edit') return openUserSheet(u);

  if (act === 'toggle') {
    const nextActive = !u.active;
    if (!nextActive && !confirm(`Deactivate ${u.display_name}? They won't be able to sign in, but their history stays intact.`)) return;
    const j = await postJSON('api/users.php?action=set_active', { id, active: nextActive });
    if (!j.ok) return toast(j.error, 'err');
    toast(nextActive ? 'Reactivated' : 'Deactivated', 'good');
    loadTeam();
  }
});

on('#btn-new-user', 'click', () => openUserSheet());
on('#sb-team', 'click', () => { $('#sb-menu').hidden = true; show('team'); });
on('#tb-team', 'click', () => { $('#tb-menu').hidden = true; show('team'); });

on('#sys-toggle', 'click', async () => {
  const body = $('#sys-body');
  const btn = $('#sys-toggle');
  const opening = body.hidden;
  body.hidden = !opening;
  btn.classList.toggle('open', opening);
  if (opening) await loadSystemLogs();
});

async function loadSystemLogs() {
  const el = $('#sys-logs');
  el.innerHTML = skeletonList(2);
  const j = await api('api/system.php?action=logs');
  if (!j.ok) { el.innerHTML = `<div class="sys-empty">${esc(j.error || 'Could not load.')}</div>`; return; }
  if (!j.logs.length) { el.innerHTML = '<div class="sys-empty">No errors logged — everything looks healthy.</div>'; return; }
  el.innerHTML = j.logs.map(l => `
    <div class="sys-log-row">
      <div class="slr-top"><span class="slr-kind">${esc(l.kind)}</span><span>${esc(timeAgo(l.created_at))}</span></div>
      <div class="slr-detail">${esc(l.detail || '')}</div>
    </div>`).join('');
}

on('#sys-backup', 'click', () => {
  toast('Preparing your backup — this may take a moment for a large database…');
  window.location.href = 'api/system.php?action=backup';
});

function openUserSheet(user) {
  const u = user || {};
  const isEdit = !!user;

  openSheet(isEdit ? 'Edit person' : 'Add someone new', `
    <label>Full name
      <input id="us-name" value="${esc(u.display_name || '')}" placeholder="Alex Rivera" autocomplete="off">
    </label>
    <label>Username (for signing in)
      <input id="us-username" value="${esc(u.username || '')}" placeholder="alex" autocomplete="off" autocapitalize="none">
    </label>
    <label>${isEdit ? 'New password (leave blank to keep it)' : 'Password'}
      <input id="us-password" type="password" placeholder="${isEdit ? '••••••••' : 'At least 6 characters'}" autocomplete="new-password">
    </label>
    <label>Their phone number
      <input id="us-phone" value="${esc(u.phone_number || '')}" placeholder="(555) 123-4567" inputmode="tel" autocomplete="off">
      <div class="field-hint">The Telnyx number this person calls and texts from.</div>
    </label>
    <label>SIP Connection ID
      <input id="us-sipconn" value="${esc(u.sip_connection_id || '')}" placeholder="From Telnyx → Voice → Credential Connections" autocomplete="off">
    </label>
    <label>SIP username
      <input id="us-sipuser" value="${esc(u.sip_username || '')}" placeholder="Their SIP login" autocomplete="off">
    </label>
    <label>SIP password
      <input id="us-sippass" type="password" placeholder="${isEdit ? '••••••••' : 'Their SIP password'}" autocomplete="new-password">
      <div class="field-hint">${isEdit ? 'Leave blank to keep the current one.' : 'Each person needs their own SIP credential in Telnyx so calls ring their browser, not everyone\u2019s.'}</div>
    </label>
    <label>Role
      <select id="us-role">
        <option value="agent" ${u.role !== 'admin' ? 'selected' : ''}>Agent — sees only their own line</option>
        <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin — can manage the team</option>
      </select>
    </label>
    <button class="btn-primary" id="us-save">${isEdit ? 'Save changes' : 'Add them'}</button>
  `);

  $('#us-save').onclick = async () => {
    const payload = {
      id: u.id || 0,
      display_name: $('#us-name').value.trim(),
      username: $('#us-username').value.trim(),
      password: $('#us-password').value,
      phone_number: $('#us-phone').value.trim(),
      sip_connection_id: $('#us-sipconn').value.trim(),
      sip_username: $('#us-sipuser').value.trim(),
      sip_password: $('#us-sippass').value,
      role: $('#us-role').value,
    };
    const btn = $('#us-save');
    btn.disabled = true;
    const j = await postJSON('api/users.php?action=save', payload);
    btn.disabled = false;
    if (!j.ok) return toast(j.error, 'err');
    closeSheet();
    toast(isEdit ? 'Saved' : 'Added — send them their username and password', 'good');
    loadTeam();
  };
}



function switchDialTab(tab) {
  state.dialTab = tab;
  $$('#dial-tabs button').forEach(b => b.classList.toggle('active', b.dataset.dtab === tab));
  $('#dial-keypad-wrap').hidden = tab !== 'dialer';
  $('#dial-recent-wrap').hidden = tab !== 'recent';
  $('#dial-fav-wrap').hidden = tab !== 'favorites';
  if (tab === 'recent') renderDialRecent();
  if (tab === 'favorites') renderDialFavorites();
}

$('#dial-tabs').addEventListener('click', e => {
  const b = e.target.closest('[data-dtab]');
  if (b) switchDialTab(b.dataset.dtab);
});

async function renderDialRecent() {
  const el = $('#dial-recent-list');
  el.innerHTML = skeletonList(4);
  const j = await api('api/calls.php?action=history');
  if (state.dialTab !== 'recent') return;
  if (!j.ok) return;
  state.calls = j.calls;

  if (!j.calls.length) {
    el.innerHTML = `<div class="empty">
      <div class="empty-glyph"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg></div>
      <p>No calls yet</p><small>Recent calls show up here.</small>
    </div>`;
    return;
  }

  el.innerHTML = j.calls.slice(0, 30).map((c, i) => {
    const missed = c.direction === 'inbound' && c.status !== 'answered' && c.status !== 'completed';
    const arrow = c.direction === 'outbound'
      ? '<path d="M7 17 17 7M7 7h10v10"/>'
      : '<path d="M17 7 7 17M17 17H7V7"/>';
    return `
      <div class="row" data-recent="${esc(c.phone)}" style="animation-delay:${Math.min(i * 12, 180)}ms">
        ${avatarHTML(c.name, c.phone)}
        <div class="row-main">
          <div class="row-top">
            <div class="row-name" style="${missed ? 'color:var(--bad)' : ''}">${esc(c.display)}</div>
            <div class="row-time">${esc(timeAgo(c.created_at))}</div>
          </div>
          <div class="row-sub">
            <svg viewBox="0 0 24 24" class="${missed ? 'miss' : ''}">${arrow}</svg>
            <span class="dur">${c.duration > 0 ? esc(clock(c.duration)) : esc(missed ? 'Missed' : (c.status || ''))}</span>
          </div>
        </div>
      </div>`;
  }).join('');
}

$('#dial-recent-list').addEventListener('click', e => {
  const row = e.target.closest('.row[data-recent]');
  if (row) startCall(row.dataset.recent);
});

function renderDialFavorites() {
  const el = $('#dial-fav-list');
  const favs = state.contacts.filter(c => pins.has(c.phone));

  if (!favs.length) {
    el.innerHTML = `<div class="empty">
      <div class="empty-glyph"><svg viewBox="0 0 24 24"><path d="M12 17v5M9 3h6l-1 7 4 3H6l4-3-1-7z"/></svg></div>
      <p>No favorites yet</p>
      <small>Pin a conversation or star a contact to see it here.</small>
    </div>`;
    return;
  }

  el.innerHTML = favs.map((c, i) => `
    <div class="row" data-fav="${esc(c.phone)}" style="animation-delay:${Math.min(i * 12, 180)}ms">
      ${avatarHTML(c.name, c.phone)}
      <div class="row-main">
        <div class="row-name">${esc(c.display)}</div>
        <div class="row-sub">${esc(pretty(c.phone))}</div>
      </div>
      <div class="row-actions">
        <button class="icon-btn" data-act="call" title="Call"><svg viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg></button>
      </div>
    </div>`).join('');
}

$('#dial-fav-list').addEventListener('click', e => {
  const row = e.target.closest('.row[data-fav]');
  if (!row) return;
  if (e.target.closest('[data-act="call"]')) return startCall(row.dataset.fav);
  startCall(row.dataset.fav);
});

/* ============================================================
   COMMAND PALETTE  (Ctrl/Cmd K)
   ============================================================ */

let cmdkItems = [], cmdkSel = 0;

function openCmdk() {
  $('#cmdk-backdrop').hidden = false;
  const i = $('#cmdk-input');
  i.value = ''; cmdkSel = 0;
  buildCmdk('');
  setTimeout(() => i.focus(), 40);
}
function closeCmdk() { $('#cmdk-backdrop').hidden = true; }

function buildCmdk(q) {
  const query = q.trim().toLowerCase();
  const digits = q.replace(/[^0-9+]/g, '');
  const items = [];

  // direct dial / text when it looks like a number
  if (digits.length >= 7) {
    const n = normalize(digits);
    items.push({
      group: 'Number', icon: 'call', title: 'Call ' + pretty(n), sub: 'Start a call now',
      run: () => { closeCmdk(); startCall(n); },
    });
    items.push({
      group: 'Number', icon: 'msg', title: 'Text ' + pretty(n), sub: 'Open a new message',
      run: () => { closeCmdk(); openNewMessage(pretty(n)); },
    });
  }

  // contacts
  state.contacts
    .filter(c => !query || (c.display || '').toLowerCase().includes(query) || (c.phone || '').includes(digits || '§'))
    .slice(0, 6)
    .forEach(c => items.push({
      group: 'Contacts', icon: 'person', title: c.display, sub: c.name ? pretty(c.phone) : 'Open conversation',
      run: () => { closeCmdk(); if (!isDesktop()) show('messages'); openThread(c.phone); },
    }));

  // conversations by message content
  if (query.length >= 2) {
    state.threads
      .filter(t => (t.last_body || '').toLowerCase().includes(query))
      .slice(0, 5)
      .forEach(t => items.push({
        group: 'Messages', icon: 'msg', title: t.display, sub: t.last_body || '',
        run: () => { closeCmdk(); if (!isDesktop()) show('messages'); openThread(t.phone); },
      }));
  }

  // actions
  const actions = [
    { title: 'New message', sub: 'Start a conversation', icon: 'edit', run: () => { closeCmdk(); openNewMessage(); } },
    { title: 'New contact', sub: 'Save a name to a number', icon: 'person', run: () => { closeCmdk(); openContactSheet(); } },
    { title: 'Go to keypad', sub: 'Dial a number', icon: 'keypad', run: () => { closeCmdk(); show('keypad'); } },
    { title: 'Insights', sub: 'Volume, response time, busiest hours', icon: 'chart', run: () => { closeCmdk(); show('insights'); } },
    { title: 'Audio settings', sub: 'Microphone and speaker', icon: 'gear', run: () => { closeCmdk(); $('#audio-settings').click(); } },
    { title: 'Export data', sub: 'Download messages and calls as CSV', icon: 'down', run: () => { closeCmdk(); exportData(); } },
  ];
  actions
    .filter(a => !query || a.title.toLowerCase().includes(query) || a.sub.toLowerCase().includes(query))
    .forEach(a => items.push({ ...a, group: 'Actions' }));

  cmdkItems = items;
  if (cmdkSel >= items.length) cmdkSel = 0;
  paintCmdk();
}

const CMDK_ICONS = {
  call: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
  msg: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  person: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  edit: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  keypad: '<circle cx="5" cy="5" r="1.6"/><circle cx="12" cy="5" r="1.6"/><circle cx="19" cy="5" r="1.6"/><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/><circle cx="5" cy="19" r="1.6"/><circle cx="12" cy="19" r="1.6"/><circle cx="19" cy="19" r="1.6"/>',
  chart: '<path d="M3 3v18h18"/><path d="M7 15l3.5-4 3 2.5L20 7"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  down: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5M12 15V3"/>',
};

function paintCmdk() {
  const el = $('#cmdk-list');
  if (!cmdkItems.length) {
    el.innerHTML = `<div class="cmdk-empty">Nothing found. Try a name, a number, or a word from a message.</div>`;
    return;
  }
  let html = '', group = '';
  cmdkItems.forEach((it, i) => {
    if (it.group !== group) { group = it.group; html += `<div class="cmdk-group">${esc(group)}</div>`; }
    html += `
      <div class="cmdk-item ${i === cmdkSel ? 'sel' : ''}" data-i="${i}">
        <svg viewBox="0 0 24 24">${CMDK_ICONS[it.icon] || CMDK_ICONS.msg}</svg>
        <div class="ci-main">
          <div class="ci-title">${esc(it.title)}</div>
          <div class="ci-sub">${esc(it.sub || '')}</div>
        </div>
      </div>`;
  });
  el.innerHTML = html;
  el.querySelector('.cmdk-item.sel')?.scrollIntoView({ block: 'nearest' });
}

$('#cmdk-input').addEventListener('input', e => { cmdkSel = 0; buildCmdk(e.target.value); });

$('#cmdk-list').addEventListener('click', e => {
  const it = e.target.closest('[data-i]');
  if (it) cmdkItems[Number(it.dataset.i)]?.run();
});

$('#cmdk-backdrop').addEventListener('click', e => {
  if (e.target.id === 'cmdk-backdrop') closeCmdk();
});

$('#tb-search-input').addEventListener('focus', (e) => { e.target.blur(); openCmdk(); });
$('.tb-search').addEventListener('click', openCmdk);

document.addEventListener('keydown', e => {
  const cmdk = !$('#cmdk-backdrop').hidden;

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    cmdk ? closeCmdk() : openCmdk();
    return;
  }

  if (e.key === 'Escape') {
    if (cmdk) return closeCmdk();
    if (!$('#sheet-backdrop').hidden) return closeSheet();
    if (!$('#thread-menu').hidden) { $('#thread-menu').hidden = true; return; }
    return;
  }

  if (!cmdk) return;
  if (e.key === 'ArrowDown') { e.preventDefault(); cmdkSel = Math.min(cmdkSel + 1, cmdkItems.length - 1); paintCmdk(); }
  if (e.key === 'ArrowUp')   { e.preventDefault(); cmdkSel = Math.max(cmdkSel - 1, 0); paintCmdk(); }
  if (e.key === 'Enter')     { e.preventDefault(); cmdkItems[cmdkSel]?.run(); }
});

/* Physical-keyboard DTMF during an active call — lets an agent type
   digits (e.g. to navigate an IVR) without reaching for the mouse.
   Ignored while typing into any text field so it never hijacks
   normal typing. */
document.addEventListener('keydown', e => {
  if (!state.call || !state.call.startedAt || !rtcCall) return;
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  if (!DTMF_FREQ[e.key]) return;
  e.preventDefault();
  playDtmfTone(e.key);
  try { rtcCall.dtmf(e.key); haptic(8); } catch {}
});

/* ============================================================
   INSIGHTS
   ============================================================ */

async function renderInsights() {
  const el = $('#insights-body');
  el.innerHTML = `<div class="panel"><div class="skel-line" style="width:60%"></div><div class="skel-line" style="width:85%"></div></div>`;

  // pull every thread we can so the numbers are real
  const [threadsRes, callsRes] = await Promise.all([
    api('api/messages.php?action=threads'),
    api('api/calls.php?action=history'),
  ]);
  const threads = threadsRes.ok ? threadsRes.threads : [];
  const calls   = callsRes.ok ? callsRes.calls : [];

  // fetch message bodies for the top threads (cached where possible)
  const sample = threads.slice(0, 25);
  const all = [];
  for (const t of sample) {
    let msgs = msgCache[t.phone];
    if (!msgs) {
      const j = await api('api/messages.php?action=thread&phone=' + encodeURIComponent(t.phone));
      if (j.ok) { msgs = j.messages; msgCache[t.phone] = msgs; }
    }
    if (msgs) msgs.forEach(m => all.push({ ...m, phone: t.phone }));
  }

  const now = Date.now();
  const DAY = 86400000;
  const in7 = all.filter(m => now - parseTime(m.created_at).getTime() < 7 * DAY);
  const prev7 = all.filter(m => {
    const d = now - parseTime(m.created_at).getTime();
    return d >= 7 * DAY && d < 14 * DAY;
  });

  const sent7 = in7.filter(m => m.direction === 'outbound').length;
  const recv7 = in7.filter(m => m.direction === 'inbound').length;
  const delta = prev7.length ? Math.round(((in7.length - prev7.length) / prev7.length) * 100) : null;

  // median response time: inbound -> next outbound in the same thread
  const gaps = [];
  const byPhone = {};
  all.forEach(m => { (byPhone[m.phone] ||= []).push(m); });
  Object.values(byPhone).forEach(list => {
    list.sort((a, b) => Number(a.id) - Number(b.id));
    for (let i = 0; i < list.length - 1; i++) {
      if (list[i].direction === 'inbound' && list[i + 1].direction === 'outbound') {
        const g = parseTime(list[i + 1].created_at) - parseTime(list[i].created_at);
        if (g > 0 && g < 12 * 3600000) gaps.push(g);
      }
    }
  });
  gaps.sort((a, b) => a - b);
  const median = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 0;
  const medLabel = !gaps.length ? '—'
    : median < 60000 ? Math.round(median / 1000) + 's'
    : median < 3600000 ? Math.round(median / 60000) + 'm'
    : (median / 3600000).toFixed(1) + 'h';

  // calls
  const calls7 = calls.filter(c => now - parseTime(c.created_at).getTime() < 7 * DAY);
  const talkSec = calls7.reduce((a, c) => a + Number(c.duration || 0), 0);
  const talkLabel = talkSec >= 3600 ? (talkSec / 3600).toFixed(1) + 'h' : Math.round(talkSec / 60) + 'm';
  const missed = calls7.filter(c => c.direction === 'inbound' && c.status !== 'answered' && c.status !== 'completed').length;

  // 14-day histogram
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(now - (13 - i) * DAY);
    const key = d.toDateString();
    const n = all.filter(m => parseTime(m.created_at).toDateString() === key).length;
    return { d, n };
  });
  const maxDay = Math.max(1, ...days.map(x => x.n));

  // busiest hours
  const hours = Array(24).fill(0);
  all.forEach(m => { hours[parseTime(m.created_at).getHours()]++; });
  const peak = hours.indexOf(Math.max(...hours));
  const hLabel = (h) => (h % 12 === 0 ? 12 : h % 12) + (h < 12 ? 'am' : 'pm');

  // top contacts
  const counts = {};
  all.forEach(m => { counts[m.phone] = (counts[m.phone] || 0) + 1; });
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const topMax = Math.max(1, ...top.map(t => t[1]));

  el.innerHTML = `
    <div class="kpi-grid">
      <div class="kpi">
        <div class="kpi-label">Messages · 7 days</div>
        <div class="kpi-val">${in7.length}</div>
        <div class="kpi-sub ${delta > 0 ? 'up' : delta < 0 ? 'down' : ''}">
          ${delta === null ? `${sent7} sent · ${recv7} received` :
            `${delta > 0 ? '▲' : delta < 0 ? '▼' : '·'} ${Math.abs(delta)}% vs last week`}
        </div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Median reply</div>
        <div class="kpi-val">${medLabel}</div>
        <div class="kpi-sub">${gaps.length} replies measured</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Talk time · 7 days</div>
        <div class="kpi-val">${talkLabel}</div>
        <div class="kpi-sub">${calls7.length} call${calls7.length === 1 ? '' : 's'}</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Missed · 7 days</div>
        <div class="kpi-val">${missed}</div>
        <div class="kpi-sub ${missed > 0 ? 'down' : 'up'}">${missed ? 'Worth calling back' : 'All answered'}</div>
      </div>
    </div>

    <div class="panel">
      <h3>Message volume · last 14 days</h3>
      <div class="spark">
        ${days.map((x, i) => `<i style="height:${Math.max(4, (x.n / maxDay) * 100)}%;animation-delay:${i * 26}ms" title="${x.n} on ${x.d.toLocaleDateString()}"></i>`).join('')}
      </div>
      <div class="spark-x">
        ${days.map((x, i) => `<span>${i % 3 === 0 ? x.d.getDate() : ''}</span>`).join('')}
      </div>
    </div>

    <div class="panel">
      <h3>Busiest hour · ${hours[peak] ? hLabel(peak) : '—'}</h3>
      <div class="spark">
        ${hours.map((n, i) => `<i style="height:${Math.max(3, (n / Math.max(1, ...hours)) * 100)}%;animation-delay:${i * 12}ms" title="${n} at ${hLabel(i)}"></i>`).join('')}
      </div>
      <div class="spark-x">
        ${hours.map((_, i) => `<span>${i % 6 === 0 ? hLabel(i).replace(/[ap]m/, '') : ''}</span>`).join('')}
      </div>
    </div>

    <div class="panel">
      <h3>Most active conversations</h3>
      ${top.length ? top.map(([phone, n]) => `
        <div class="hbar">
          <div class="hb-name">${esc(displayFor(phone))}</div>
          <div class="hb-track"><div class="hb-fill" style="width:${(n / topMax) * 100}%"></div></div>
          <div class="hb-val">${n}</div>
        </div>`).join('')
      : '<div style="color:var(--tx-4);font-size:13px">Nothing to show yet.</div>'}
    </div>
  `;
}

/* ---------- CSV export ---------- */
function csvCell(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

async function exportData() {
  toast('Preparing your export…');
  const rows = [['type', 'phone', 'name', 'direction', 'when', 'status', 'duration_sec', 'body']];

  for (const t of state.threads) {
    let msgs = msgCache[t.phone];
    if (!msgs) {
      const j = await api('api/messages.php?action=thread&phone=' + encodeURIComponent(t.phone));
      if (j.ok) { msgs = j.messages; msgCache[t.phone] = msgs; }
    }
    (msgs || []).forEach(m => rows.push(['message', t.phone, t.name || '', m.direction, m.created_at, m.status || '', '', m.body || '']));
  }
  const cj = await api('api/calls.php?action=history');
  if (cj.ok) cj.calls.forEach(c => rows.push(['call', c.phone, c.name || '', c.direction, c.created_at, c.status || '', c.duration || 0, '']));

  const csv = rows.map(r => r.map(csvCell).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'console-export-' + new Date().toISOString().slice(0, 10) + '.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast('Export downloaded', 'good');
}

$('#btn-export').onclick = exportData;

/* ============================================================
   SYSTEM NOTIFICATIONS
   ============================================================ */

let activeNotif = null;

function askNotifPermission() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    Notification.requestPermission().catch(() => {});
  }
}
document.addEventListener('pointerdown', function once() {
  askNotifPermission();
  document.removeEventListener('pointerdown', once);
}, { once: true });

function tabIsAway() { return document.hidden || !document.hasFocus(); }

function systemNotify(title, body, { sticky, phone } = {}) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return null;
  try {
    const n = new Notification(title, {
      body,
      icon: 'assets/icon-192.png',
      badge: 'assets/icon-192.png',
      tag: 'dialer-' + (sticky ? 'call' : ('msg-' + (phone || 'x'))),
      renotify: true,
      requireInteraction: !!sticky,
      silent: !sticky,
      vibrate: sticky ? [400, 200, 400] : [200],
      timestamp: Date.now(),
    });
    n.onclick = () => {
      window.focus();
      try {
        if (sticky) { $('#incoming-answer')?.click(); }
        else if (phone) { show('messages'); openThread(phone); }
      } catch {}
      n.close();
    };
    return n;
  } catch { return null; }
}

function closeCallNotif() {
  if (activeNotif) { try { activeNotif.close(); } catch {} activeNotif = null; }
}

/* ============================================================
   IN-APP MESSAGE NOTIFICATION — bottom-left, always works
   (doesn't depend on the OS Notification permission at all)
   ============================================================ */

const MSG_TOAST_MAX = 4;
const MSG_TOAST_LIFE = 6500;

function showMsgToast(name, phone, body, rawName, kind) {
  kind = kind || 'message';
  const stack = $('#msg-toast-stack');
  if (!stack) return;

  // don't pile up duplicates for the same conversation/kind
  Array.from(stack.children).forEach(el => {
    if (el.dataset.phone === phone && el.dataset.kind === kind) removeMsgToast(el, true);
  });

  while (stack.children.length >= MSG_TOAST_MAX) {
    removeMsgToast(stack.firstElementChild, true);
  }

  const el = document.createElement('div');
  el.className = 'msg-toast';
  el.dataset.phone = phone;
  el.dataset.kind = kind;
  const kindLabel = kind === 'voicemail' ? 'New voicemail' : esc(name);
  el.innerHTML = `
    ${avatarHTML(rawName, phone)}
    <div class="mt-body">
      <div class="mt-top">
        <div class="mt-name">${kindLabel}</div>
        <div class="mt-time">now</div>
      </div>
      <div class="mt-preview">${kind === 'voicemail' ? esc(name) + ' — ' : ''}${esc(body || '')}</div>
    </div>
    <button class="mt-close" title="Dismiss"><svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
  `;
  el.addEventListener('click', (e) => {
    if (e.target.closest('.mt-close')) { removeMsgToast(el); return; }
    if (kind === 'voicemail') {
      show('voicemail');
    } else {
      if (!isDesktop()) show('messages');
      openThread(phone);
    }
    removeMsgToast(el);
  });

  stack.appendChild(el);
  el._timer = setTimeout(() => removeMsgToast(el), MSG_TOAST_LIFE);
}

function removeMsgToast(el, instant) {
  if (!el || el.dataset.leaving) return;
  el.dataset.leaving = '1';
  clearTimeout(el._timer);
  if (instant) { el.remove(); return; }
  el.classList.add('leaving');
  setTimeout(() => el.remove(), 240);
}

/* Bright two-note chime for an arriving message — deliberately distinct
   from the call ringtone so the two are never confused by ear. */
let chimeCtx;
function playMsgChime() {
  try {
    chimeCtx = chimeCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (chimeCtx.state === 'suspended') chimeCtx.resume().catch(() => {});
    const t0 = chimeCtx.currentTime + 0.01;
    const master = chimeCtx.createGain();
    master.gain.value = 0.5;
    master.connect(chimeCtx.destination);

    const notes = [[1318.5, 0, 0.16], [1760.0, 0.09, 0.22]]; // E6 -> A6, bright ascending ding
    notes.forEach(([freq, at, dur]) => {
      const o = chimeCtx.createOscillator();
      const g = chimeCtx.createGain();
      o.type = 'sine'; o.frequency.value = freq;
      o.connect(g); g.connect(master);
      g.gain.setValueAtTime(0.0001, t0 + at);
      g.gain.exponentialRampToValueAtTime(0.9, t0 + at + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
      o.start(t0 + at); o.stop(t0 + at + dur + 0.03);
    });
  } catch {}
  haptic(60);
}

/* ============================================================
   CALLING — WebRTC
   ============================================================ */

let rtcCall = null;
let timerInt = null;
let reconnectTimer = null;

const MIC = {
  audio: {
    echoCancellation: { ideal: true },
    noiseSuppression: { ideal: true },
    autoGainControl:  { ideal: true },
    channelCount: 1,
    latency: { ideal: 0 },
  },
  video: false,
};

const audioPrefs = {
  get micId()    { try { return localStorage.getItem('dial_mic')  || ''; } catch { return ''; } },
  set micId(v)   { try { localStorage.setItem('dial_mic', v); } catch {} },
  get spkId()    { try { return localStorage.getItem('dial_spk')  || ''; } catch { return ''; } },
  set spkId(v)   { try { localStorage.setItem('dial_spk', v); } catch {} },
  get volume()   { try { return Number(localStorage.getItem('dial_vol') ?? 100); } catch { return 100; } },
  set volume(v)  { try { localStorage.setItem('dial_vol', String(v)); } catch {} },
};

function micConstraints() {
  const c = JSON.parse(JSON.stringify(MIC.audio));
  if (audioPrefs.micId) c.deviceId = { exact: audioPrefs.micId };
  return c;
}

function applyVolume() {
  const el = $('#remote-audio');
  if (el) el.volume = Math.min(1, Math.max(0, audioPrefs.volume / 100));
}

async function applySpeaker() {
  const el = $('#remote-audio');
  if (!el || !audioPrefs.spkId) return;
  if (typeof el.setSinkId !== 'function') return;
  try { await el.setSinkId(audioPrefs.spkId); } catch {}
}

/**
 * Follows hardware changes automatically — plugging in headphones (or
 * unplugging them) mid-call. This only kicks in when the user hasn't
 * explicitly pinned a specific device in Audio Settings, since an
 * intentional choice should stick regardless of what gets plugged in.
 *
 * The output side (the <audio> element) already follows the OS default
 * automatically as long as no sink is pinned — nothing to do there. The
 * input side does NOT: an already-acquired microphone track stays bound
 * to whatever device it was opened on, even if the OS default changes.
 * That has to be actively re-pointed, which is what this does.
 */
let deviceChangeDebounce = null;
async function handleDeviceChange() {
  clearTimeout(deviceChangeDebounce);
  deviceChangeDebounce = setTimeout(async () => {
    if (!rtcCall || !state.call?.startedAt) return; // only matters mid-call
    if (audioPrefs.micId || audioPrefs.spkId) return; // a manual choice always wins

    try {
      // Opening an unconstrained stream resolves to whatever the OS
      // currently considers the default input — exactly what changed.
      const probe = await navigator.mediaDevices.getUserMedia({ audio: micConstraints(), video: false });
      const newMicId = probe.getAudioTracks()[0]?.getSettings()?.deviceId;
      probe.getTracks().forEach(t => t.stop());

      if (newMicId && typeof rtcCall.setAudioInDevice === 'function') {
        await rtcCall.setAudioInDevice(newMicId);
      }
      if (typeof rtcCall.setAudioOutDevice === 'function') {
        try { await rtcCall.setAudioOutDevice('default'); } catch {}
      }
      const el = $('#remote-audio');
      if (el?.setSinkId) await el.setSinkId('default').catch(() => {});
      toast('Switched to the new audio device', 'good');
    } catch (err) {
      console.error('auto device-switch failed', err);
    }
  }, 600); // debounce — a single hotplug event can fire devicechange more than once
}
navigator.mediaDevices?.addEventListener?.('devicechange', handleDeviceChange);

async function listAudioDevices() {
  try {
    const devs = await navigator.mediaDevices.enumerateDevices();
    return {
      mics: devs.filter(d => d.kind === 'audioinput'),
      spks: devs.filter(d => d.kind === 'audiooutput'),
    };
  } catch { return { mics: [], spks: [] }; }
}

/* ---------- LIVE WAVEFORM (the signature) ----------
   Reads the real outgoing mic stream through an AnalyserNode
   and drives the bar heights. No fake animation.            */
const WAVE_BARS = 28;
let waveCtx, waveAnalyser, waveRAF, waveStream, waveSrc;

function buildWave() {
  const w = $('#call-wave');
  const mw = $('#mini-wave');
  if (w && !w.children.length) w.innerHTML = Array.from({ length: WAVE_BARS }, () => '<i></i>').join('');
  if (mw && !mw.children.length) mw.innerHTML = Array.from({ length: 7 }, () => '<i></i>').join('');
}

async function startWave() {
  if (reduceMotion) return;
  try {
    stopWave();
    buildWave();
    waveStream = await navigator.mediaDevices.getUserMedia({ audio: micConstraints(), video: false });
    waveCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (waveCtx.state === 'suspended') await waveCtx.resume().catch(() => {});
    waveSrc = waveCtx.createMediaStreamSource(waveStream);
    waveAnalyser = waveCtx.createAnalyser();
    waveAnalyser.fftSize = 128;
    waveAnalyser.smoothingTimeConstant = 0.72;
    waveSrc.connect(waveAnalyser);

    const buf = new Uint8Array(waveAnalyser.frequencyBinCount);
    const bars = Array.from($('#call-wave').children);
    const mini = Array.from($('#mini-wave').children);

    const tick = () => {
      waveAnalyser.getByteFrequencyData(buf);
      const muted = state.call?.muted;
      for (let i = 0; i < bars.length; i++) {
        const v = muted ? 0 : buf[Math.floor(i * buf.length / bars.length)] / 255;
        const h = 4 + v * 30;
        bars[i].style.height = h.toFixed(1) + 'px';
        bars[i].classList.toggle('hot', v > 0.5);
      }
      for (let i = 0; i < mini.length; i++) {
        const v = muted ? 0 : buf[Math.floor(i * buf.length / mini.length)] / 255;
        mini[i].style.height = (3 + v * 11).toFixed(1) + 'px';
      }
      waveRAF = requestAnimationFrame(tick);
    };
    tick();
  } catch { /* mic not available — the card still works, just no meter */ }
}

function stopWave() {
  if (waveRAF) cancelAnimationFrame(waveRAF);
  waveRAF = null;
  try { waveStream?.getTracks().forEach(t => t.stop()); } catch {}
  try { waveSrc?.disconnect(); } catch {}
  try { waveCtx?.close(); } catch {}
  waveStream = waveSrc = waveAnalyser = waveCtx = null;
  $$('#call-wave i').forEach(b => { b.style.height = '4px'; b.classList.remove('hot'); });
}

/* ---------- CALL QUALITY from real WebRTC stats ---------- */
let qualInt = null, lastLost = 0, lastRecv = 0;

function startQuality() {
  stopQuality();
  lastLost = lastRecv = 0;
  $('#call-qual').hidden = false;
  qualInt = setInterval(async () => {
    try {
      const pc = rtcCall?.peer?.instance || rtcCall?.peer?.peerConnection || rtcCall?.rtcPeerConnection;
      if (!pc || typeof pc.getStats !== 'function') return;
      const stats = await pc.getStats();
      let lost = 0, recv = 0, jitter = 0;
      stats.forEach(r => {
        if (r.type === 'inbound-rtp' && r.kind === 'audio') {
          lost = r.packetsLost || 0;
          recv = r.packetsReceived || 0;
          jitter = r.jitter || 0;
        }
      });
      const dLost = Math.max(0, lost - lastLost);
      const dRecv = Math.max(0, recv - lastRecv);
      lastLost = lost; lastRecv = recv;
      if (dRecv === 0 && dLost === 0) return;

      const loss = dRecv ? dLost / (dRecv + dLost) : 0;
      const j = jitter * 1000;
      let grade = 4, label = 'Excellent';
      if (loss > 0.08 || j > 60)      { grade = 1; label = 'Poor connection'; }
      else if (loss > 0.04 || j > 40) { grade = 2; label = 'Unstable'; }
      else if (loss > 0.01 || j > 25) { grade = 3; label = 'Good'; }

      const qb = $('#qbars');
      qb.className = 'qbars g' + grade + (grade === 1 ? ' bad' : '');
      $('#qual-label').textContent = label;
    } catch {}
  }, 2500);
}
function stopQuality() {
  clearInterval(qualInt); qualInt = null;
  const q = $('#call-qual'); if (q) q.hidden = true;
}

/* ============================================================
   CALL RECORDING — fully client-side, no server involved.
   A single MediaElementAudioSourceNode is created from the remote
   <audio> element ONCE, ever (the browser forbids creating a second
   one from the same element for the lifetime of the page), and reused
   across every call. Each recording session mixes that shared node
   with a fresh mic tap into a MediaStreamDestination and records the
   result with MediaRecorder. Stopping (manually, or automatically
   when the call ends) triggers an instant local download — nothing
   is ever uploaded anywhere.
   ============================================================ */

let sharedAudioCtx = null;
let recMicStream = null, recMicSource = null, recRemoteSource = null, recDest = null;
let recorder = null, recordedChunks = [];
let isRecording = false;

function ensureAudioCtx() {
  sharedAudioCtx = sharedAudioCtx || new (window.AudioContext || window.webkitAudioContext)();
  return sharedAudioCtx;
}

/**
 * Taps the CURRENT call's live remote-audio stream directly (rather than
 * the <audio> element itself). Tapping the stream avoids a real, observed
 * bug: tapping the element via createMediaElementSource is tied to
 * whatever the element's srcObject was at that exact instant and can
 * silently miss audio across a call, especially the very call it was
 * meant to capture. A fresh stream tap has no such one-time restriction
 * and always reflects whatever is actually live right now.
 */
function getRemoteStreamSource() {
  const remoteEl = $('#remote-audio');
  const stream = remoteEl?.srcObject;
  if (!stream || typeof stream.getAudioTracks !== 'function' || stream.getAudioTracks().length === 0) {
    return null;
  }
  return ensureAudioCtx().createMediaStreamSource(stream);
}

function setRecordUI(active) {
  const btn = $('#call-record');
  if (btn) btn.classList.toggle('active', active);
}

async function startRecording() {
  if (isRecording || !window.MediaRecorder) {
    if (!window.MediaRecorder) toast('This browser cannot record audio.', 'err');
    return;
  }
  const src = getRemoteStreamSource();
  if (!src) return toast('Wait until the call connects before recording.', 'err');

  try {
    const ctx = ensureAudioCtx();
    if (ctx.state === 'suspended') await ctx.resume().catch(() => {});

    recMicStream = await navigator.mediaDevices.getUserMedia({ audio: micConstraints(), video: false });
    recMicSource = ctx.createMediaStreamSource(recMicStream);
    recRemoteSource = src;
    recDest = ctx.createMediaStreamDestination();
    recMicSource.connect(recDest);
    recRemoteSource.connect(recDest);

    recordedChunks = [];
    const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
    recorder = new MediaRecorder(recDest.stream, mimeType ? { mimeType } : undefined);
    recorder.ondataavailable = e => { if (e.data.size > 0) recordedChunks.push(e.data); };
    recorder.start();
    isRecording = true;
    setRecordUI(true);
    toast('Recording this call', 'good');
  } catch (err) {
    console.error('recording failed to start', err);
    toast('Could not start recording — check microphone access.', 'err');
    isRecording = false;
    setRecordUI(false);
    cleanupRecordingNodes();
  }
}

function cleanupRecordingNodes() {
  try { recMicSource?.disconnect(); } catch {}
  try { recRemoteSource?.disconnect(); } catch {}
  try { recDest?.disconnect(); } catch {}
  try { recMicStream?.getTracks().forEach(t => t.stop()); } catch {}
  recMicSource = null; recRemoteSource = null; recDest = null; recMicStream = null;
}

function stopRecording(download) {
  if (!isRecording) return;
  isRecording = false;
  setRecordUI(false);
  const rec = recorder;
  if (rec && rec.state !== 'inactive') {
    rec.onstop = () => {
      if (download && recordedChunks.length) {
        try {
          const blob = new Blob(recordedChunks, { type: rec.mimeType || 'audio/webm' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
          a.href = url; a.download = `call-recording-${stamp}.webm`;
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 5000);
          toast('Recording downloaded', 'good');
        } catch (err) { console.error('recording download failed', err); toast('Could not save the recording.', 'err'); }
      }
      cleanupRecordingNodes();
    };
    try { rec.stop(); } catch { cleanupRecordingNodes(); }
  } else {
    cleanupRecordingNodes();
  }
}

$('#call-record').onclick = () => { isRecording ? stopRecording(true) : startRecording(); };

/* ============================================================
   LIVE TRANSCRIPT — real-time speech-to-text via Deepgram.
   Two independent streams run in parallel so each speaker is labeled
   correctly: one fed by a fresh mic tap ("You"), one fed by the shared
   remote-audio source node already used for recording ("Caller").
   Nothing is stored server-side beyond the short-lived connection token;
   the transcript itself lives only in this tab for the length of the call.
   ============================================================ */

let transcriptOpen = false;
let dgMicStream = null, dgMicSource = null, dgMicDest = null;
let dgRemoteSource = null, dgRemoteDest = null;
let dgMicSocket = null, dgRemoteSocket = null;
let dgMicRecorder = null, dgRemoteRecorder = null;
let dgLastLine = { you: null, caller: null };
let transcriptLines = [];

function tpSetStatus(text, live) {
  const el = $('#transcript-status');
  if (!el) return;
  el.textContent = text;
  el.classList.toggle('live', !!live);
}

function tpAppend(who, text, isFinal) {
  if (!text || !text.trim()) return;
  const body = $('#transcript-body');
  if (!body) return;
  body.querySelector('.tp-empty')?.remove();

  const key = who; // 'you' | 'caller'
  let line = dgLastLine[key];
  if (!isFinal && line && !line.dataset.committed) {
    line.querySelector('.tp-text').textContent = text;
  } else {
    line = document.createElement('div');
    line.className = 'tp-line ' + who + (isFinal ? '' : ' interim');
    line.innerHTML = `<div class="tp-who">${who === 'you' ? 'You' : 'Caller'}</div><div class="tp-text"></div>`;
    line.querySelector('.tp-text').textContent = text;
    body.appendChild(line);
    dgLastLine[key] = line;
  }
  if (isFinal) {
    line.classList.remove('interim');
    line.dataset.committed = '1';
    dgLastLine[key] = null;
    transcriptLines.push({ who, text, at: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' }) });
  }
  body.scrollTop = body.scrollHeight;
}

function dgHandleMessage(who, raw) {
  let data;
  try { data = JSON.parse(raw); } catch { return; }
  const alt = data?.channel?.alternatives?.[0];
  const text = alt?.transcript;
  if (!text) return;
  tpAppend(who, text, !!data.is_final);
}

async function dgOpenStream(who, stream) {
  const t = await api('api/transcribe.php?action=token');
  if (!t.ok) throw new Error(t.error || 'Could not start transcription.');

  const url = 'wss://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&interim_results=true&punctuate=true&language=en';
  const ws = new WebSocket(url, ['bearer', t.token]);
  ws.binaryType = 'arraybuffer';

  await new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error('Transcription connection timed out.')), 8000);
    ws.onopen = () => { clearTimeout(to); resolve(); };
    ws.onerror = () => { clearTimeout(to); reject(new Error('Could not connect to the transcription service.')); };
    ws.onclose = (ev) => {
      clearTimeout(to);
      reject(new Error('Transcription service rejected the connection' + (ev.reason ? ': ' + ev.reason : '') + '.'));
    };
  });

  // connected — a close from here on just means the session ended, not a failure
  ws.onclose = () => { if (transcriptOpen) tpSetStatus('Disconnected', false); };
  ws.onerror = () => {};
  ws.onmessage = (e) => dgHandleMessage(who, e.data);

  const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
  const rec = new MediaRecorder(stream, { mimeType });
  rec.ondataavailable = (e) => {
    if (e.data.size > 0 && ws.readyState === WebSocket.OPEN) ws.send(e.data);
  };
  rec.start(250);

  return { ws, rec };
}

async function startTranscription() {
  if (!window.MediaRecorder || !window.WebSocket) {
    return toast('This browser cannot run live transcription.', 'err');
  }
  const st = await api('api/transcribe.php?action=status');
  if (!st.ok || !st.configured) {
    return toast('Live transcription is not set up — add DEEPGRAM_API_KEY in config.php.', 'err');
  }
  const src = getRemoteStreamSource();
  if (!src) return toast('Wait until the call connects before starting the transcript.', 'err');

  $('#transcript-panel').hidden = false;
  $('#call-transcript').classList.add('active');
  $('#transcript-body').innerHTML = '<div class="tp-empty">Listening…</div>';
  tpSetStatus('Connecting…', false);
  transcriptOpen = true;
  dgLastLine = { you: null, caller: null };
  transcriptLines = [];

  try {
    const ctx = ensureAudioCtx();
    if (ctx.state === 'suspended') await ctx.resume().catch(() => {});

    // your mic — a fresh independent tap, same technique as recording
    dgMicStream = await navigator.mediaDevices.getUserMedia({ audio: micConstraints(), video: false });
    dgMicSource = ctx.createMediaStreamSource(dgMicStream);
    dgMicDest = ctx.createMediaStreamDestination();
    dgMicSource.connect(dgMicDest);

    dgRemoteSource = src;
    dgRemoteDest = ctx.createMediaStreamDestination();
    dgRemoteSource.connect(dgRemoteDest);

    const [mic, caller] = await Promise.all([
      dgOpenStream('you', dgMicDest.stream),
      dgOpenStream('caller', dgRemoteDest.stream),
    ]);
    dgMicSocket = mic.ws; dgMicRecorder = mic.rec;
    dgRemoteSocket = caller.ws; dgRemoteRecorder = caller.rec;
    tpSetStatus('Live', true);
  } catch (err) {
    console.error('transcription failed to start', err);
    const msg = err.message || 'Could not start live transcription.';
    toast(msg, 'err');
    const body = $('#transcript-body');
    if (body) body.innerHTML = `<div class="tp-empty" style="color:var(--bad)">${esc(msg)}</div>`;
    stopTranscription(false);
    tpSetStatus('Failed to start', false);
  }
}

function downloadTranscript() {
  if (!transcriptLines.length) return;
  const name = state.call?.display || displayFor(state.call?.phone) || 'call';
  const when = new Date();
  const header = `Transcript with ${name}\n${when.toLocaleString()}\n${'-'.repeat(40)}\n\n`;
  const body = transcriptLines
    .map(l => `[${l.at}] ${l.who === 'you' ? 'You' : 'Caller'}: ${l.text}`)
    .join('\n');
  const blob = new Blob([header + body + '\n'], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = when.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  a.href = url; a.download = `transcript-${stamp}.txt`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  toast('Transcript downloaded', 'good');
}

function stopTranscription(download) {
  const hadContent = transcriptLines.length > 0;
  transcriptOpen = false;
  $('#call-transcript').classList.remove('active');
  tpSetStatus('Ended', false);

  try { dgMicRecorder?.stop(); } catch {}
  try { dgRemoteRecorder?.stop(); } catch {}
  try { dgMicSocket?.close(); } catch {}
  try { dgRemoteSocket?.close(); } catch {}
  try { dgMicSource?.disconnect(); } catch {}
  try { dgMicDest?.disconnect(); } catch {}
  try { dgRemoteSource?.disconnect(); } catch {}
  try { dgRemoteDest?.disconnect(); } catch {}
  try { dgMicStream?.getTracks().forEach(t => t.stop()); } catch {}

  dgMicRecorder = dgRemoteRecorder = null;
  dgMicSocket = dgRemoteSocket = null;
  dgMicSource = dgMicDest = dgRemoteSource = dgRemoteDest = null;
  dgMicStream = null;

  if (download !== false && hadContent) downloadTranscript();
}

function closeTranscriptPanel() {
  $('#transcript-panel').hidden = true;
  stopTranscription(true);
}

$('#call-transcript').onclick = () => {
  if (transcriptOpen) closeTranscriptPanel();
  else startTranscription();
};

$('#transcript-close').onclick = closeTranscriptPanel;

/* Drag the transcript panel by its header — pointer events cover mouse
   and touch in one code path. Position is clamped to stay on screen. */
(function makeTranscriptDraggable() {
  const panel = $('#transcript-panel');
  const handle = $('#transcript-drag-handle');
  if (!panel || !handle) return;
  let dragging = false, startX = 0, startY = 0, origX = 0, origY = 0;

  handle.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.tp-close')) return;
    dragging = true;
    startX = e.clientX; startY = e.clientY;
    const r = panel.getBoundingClientRect();
    origX = r.left; origY = r.top;
    handle.setPointerCapture?.(e.pointerId);
  });
  handle.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const nx = Math.max(6, Math.min(window.innerWidth - panel.offsetWidth - 6, origX + (e.clientX - startX)));
    const ny = Math.max(6, Math.min(window.innerHeight - panel.offsetHeight - 6, origY + (e.clientY - startY)));
    panel.style.left = nx + 'px';
    panel.style.top = ny + 'px';
  });
  ['pointerup', 'pointercancel'].forEach(ev => handle.addEventListener(ev, () => { dragging = false; }));
})();

/* A "generation" counter tags every registration attempt. Event handlers
   from a client that has been superseded by a newer attempt check their
   captured generation and bail out — so a client we've already abandoned
   can never trigger a reconnect on our behalf. Combined with the
   rtcConnecting mutex below, only one TelnyxRTC client can ever be
   registering at a time, which is what stops the two-instance "fight over
   the same SIP identity" loop that caused rapid reconnects.            */
let rtcGen = 0;
let rtcWatchdog = null;

async function initRTC() {
  if (!window.RTC_READY) { lamp('nocall', 'Calling not set up'); return; }
  if (window.TELNYX_CDN_FAILED || !window.TelnyxWebRTC) {
    lamp('off', 'Calling unavailable — network blocked the phone library');
    return;
  }
  if (!window.isSecureContext) { lamp('off', 'Calling needs https'); return; }
  if (state.rtcConnecting) return;   // an attempt is already in flight — never start a second one
  state.rtcConnecting = true;

  const myGen = ++rtcGen;
  clearTimeout(rtcWatchdog);

  // fully retire any previous client before creating a new one
  if (state.client) {
    try { await state.client.disconnect(); } catch {}
    state.client = null;
  }

  lamp('connecting', 'Connecting line…');

  const j = await api('api/calls.php?action=token');
  if (myGen !== rtcGen) { state.rtcConnecting = false; return; }   // superseded while awaiting
  if (!j.ok) { state.rtcConnecting = false; lamp('off', 'Line offline — ' + j.error); return; }

  const auth = j.login
    ? { login: j.login, password: j.password }
    : { login_token: j.token };

  const client = new window.TelnyxWebRTC.TelnyxRTC({
    ...auth,
    remoteElement: 'remote-audio',
  });
  state.client = client;
  client.remoteElement = 'remote-audio';

  client.on('telnyx.ready', () => {
    if (myGen !== rtcGen) return;   // a stale client finally registered after we gave up on it
    state.rtcReady = true;
    state.rtcConnecting = false;
    state.rtcRetry = 0;
    clearTimeout(rtcWatchdog);
    lamp('ready', 'Line ready');
    if (pendingCallPhone) {
      const p = pendingCallPhone;
      pendingCallPhone = null;
      clearTimeout(pendingCallTimeout);
      dialNow(p);
    }
  });

  client.on('telnyx.error', (e) => {
    if (myGen !== rtcGen) return;
    console.error('telnyx error', e);
    lamp('off', 'Line error — check your Telnyx SIP settings');
  });

  client.on('telnyx.socket.close', () => {
    if (myGen !== rtcGen) return;   // this is an old, already-abandoned client — ignore it
    state.rtcReady = false;
    state.rtcConnecting = false;
    scheduleReconnect();
  });

  client.on('telnyx.notification', (n) => {
    if (myGen !== rtcGen) return;
    if (n.type !== 'callUpdate' || !n.call) return;
    const call = n.call;

    // The SDK recovers a dropped call automatically after a brief network
    // blip (Wi-Fi hiccup, VPN reconnect, laptop sleep) by handing us a new
    // call object for the SAME conversation. Swap the reference quietly —
    // resetting the timer or UI here would make a recovered call look like
    // a dropped-and-redialed one, which is exactly what this is meant to
    // prevent.
    if (call.recoveredCallId && state.call) {
      rtcCall = call;
      setCallStatus('Connected', true);
      clearReconnectBanner();
      return;
    }

    switch (call.state) {
      case 'ringing':
        rtcCall = call;
        showIncoming(
          call.options.remoteCallerNumber || call.options.callerNumber || '',
          call.options.remoteCallerName || ''
        );
        break;
      case 'trying':
      case 'requesting':
        setCallStatus('Calling…');
        break;
      case 'early':
        setCallStatus('Ringing…');
        break;
      case 'active':
        rtcCall = call;
        $('#incoming-card').hidden = true;
        stopRing();
        setCallStatus('Connected', true);
        clearReconnectBanner();
        applyVolume(); applySpeaker();
        $('#call-card').classList.add('live');
        startWave();
        startQuality();
        if (state.call && !state.call.startedAt) {
          state.call.startedAt = Date.now();
          startTimer();
        }
        break;
      case 'hangup':
      case 'destroy':
        endCallUI(call.cause);
        break;
    }
  });

  client.on('telnyx.notification', (n) => {
    if (myGen !== rtcGen) return;
    if (n.type === 'userMediaError') lamp('off', 'Microphone blocked — allow it to receive calls');
  });

  // The SDK watches signaling + media health on its own and repairs a
  // struggling connection (ICE restart, socket re-attach) without needing
  // the call to be hung up — this just surfaces that honestly instead of
  // leaving "Connected" showing while the line is actually recovering.
  const warningEvent = window.TelnyxWebRTC.SwEvent?.Warning || 'telnyx.warning';
  client.on(warningEvent, (w) => {
    if (myGen !== rtcGen || !state.call) return;
    console.warn('telnyx warning', w);
    showReconnectBanner();
  });

  try {
    client.connect();
  } catch (e) {
    if (myGen === rtcGen) {
      state.rtcConnecting = false;
      lamp('off', 'Could not connect the line');
      scheduleReconnect();
    }
  }

  // if registration has not completed in 20s, give up and retry cleanly —
  // long enough to cover a slow shared-hosting round trip, short enough
  // that a genuinely stuck attempt still recovers on its own
  rtcWatchdog = setTimeout(() => {
    if (myGen !== rtcGen) return;
    if (!state.rtcReady) {
      lamp('connecting', 'Line slow to register — retrying');
      state.rtcConnecting = false;
      initRTC();
    }
  }, 20000);
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  state.rtcRetry++;
  const wait = Math.min(30, 2 ** state.rtcRetry);
  lamp('connecting', `Line dropped — reconnecting in ${wait}s`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    initRTC();
  }, wait * 1000);
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && !state.rtcReady && !state.rtcConnecting && window.RTC_READY && !reconnectTimer) initRTC();
});


let micPermissionConfirmed = false;
let pendingCallPhone = null;
let pendingCallTimeout = null;

async function startCall(phone) {
  const n = normalize(phone);

  if (!window.RTC_READY) {
    return toast('Calling is not set up. Fill in the SIP values in config.php first.', 'err');
  }

  if (!state.rtcReady || !state.client) {
    // Queue it rather than making the agent notice an error and retry by hand —
    // it fires the instant the line finishes registering, so a hot lead never
    // sits waiting on a manual click.
    pendingCallPhone = n;
    toast('Line is still connecting — this call will start the moment it\u2019s ready…');
    clearTimeout(pendingCallTimeout);
    pendingCallTimeout = setTimeout(() => {
      if (pendingCallPhone === n) {
        pendingCallPhone = null;
        toast('The line did not come up in time. Check your connection and try again.', 'err');
      }
    }, 15000);
    return;
  }

  await dialNow(n);
}

async function dialNow(n) {
  const c = state.contacts.find(x => x.phone === n);
  const display = c?.name || pretty(n);

  // React to the click instantly — don't make the button feel dead while
  // a permission check or anything else happens in the background.
  state.call = { phone: n, display, dir: 'outbound', startedAt: null, muted: false };
  showCallScreen(display, n, 'Calling…', c?.name);
  if (!isDesktop()) show('keypad');

  if (!micPermissionConfirmed) {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: micConstraints(), video: false });
      s.getTracks().forEach(t => t.stop());
      micPermissionConfirmed = true;
    } catch {
      endCallUI();
      toast('Allow microphone access to make calls (click the padlock in the address bar).', 'err');
      return;
    }
  }

  try {
    rtcCall = state.client.newCall({
      destinationNumber: n,
      callerNumber: window.MY_NUMBER,
      audio: micConstraints(),
      video: false,
      trickleIce: true,
    });
  } catch (e) {
    endCallUI();
    toast('The call could not be started. Check the line status and try again.', 'err');
  }
}

function showCallScreen(display, phone, status, name) {
  const av = $('#call-avatar');
  av.textContent = initials(name, phone);
  av.style.setProperty('--av-bg', avColor(phone));
  $('#call-name').textContent = display;
  setCallStatus(status);
  $('#call-timer').textContent = '';
  $('#call-dtmf').hidden = true;
  $('#transcript-panel').hidden = true;
  $('#call-transcript').classList.remove('active');
  $('#call-mute').classList.remove('active');
  $('#call-record').classList.remove('active');
  $('#call-hold').classList.remove('active');
  $('#call-hold').querySelector('span').textContent = 'Hold';
  $('#call-card').classList.remove('live', 'muted');
  buildWave();

  $('#dial-idle').hidden = true;
  $('#call-card').hidden = false;

  $('#minibar-name').textContent = display;
  $('#minibar-timer').textContent = '';
  if (!isDesktop()) $('#minibar').hidden = false;
}

function setCallStatus(s, connected) {
  const el = $('#call-status');
  if (!el) return;
  el.textContent = s;
  el.classList.toggle('connected', !!connected);
}

let reconnectBannerTimeout = null;
function showReconnectBanner() {
  setCallStatus('Reconnecting…');
  $('#call-status')?.classList.add('reconnecting');
  clearTimeout(reconnectBannerTimeout);
  // Telnyx repairs this in the background on its own; if nothing else comes
  // through in a few seconds just quietly go back to showing Connected
  // rather than leaving a stale warning up.
  reconnectBannerTimeout = setTimeout(() => {
    if (state.call && state.call.startedAt) setCallStatus('Connected', true);
    $('#call-status')?.classList.remove('reconnecting');
  }, 6000);
}
function clearReconnectBanner() {
  clearTimeout(reconnectBannerTimeout);
  reconnectBannerTimeout = null;
  $('#call-status')?.classList.remove('reconnecting');
}

function startTimer() {
  clearInterval(timerInt);
  const tl = $('#tally-live');
  tl.classList.add('on');
  timerInt = setInterval(() => {
    if (!state.call?.startedAt) return;
    const t = clock(Math.floor((Date.now() - state.call.startedAt) / 1000));
    $('#call-timer').textContent = t;
    $('#minibar-timer').textContent = t;
    $('#tally-live-t').textContent = t;
  }, 500);
}

function endCallUI(cause) {
  clearInterval(timerInt);
  stopRing();
  closeCallNotif();
  stopWave();
  stopQuality();
  clearReconnectBanner();
  if (isRecording) stopRecording(true);
  if (transcriptOpen) { stopTranscription(); $('#transcript-panel').hidden = true; }
  $('#tally-live').classList.remove('on');

  if (state.call) {
    const dur = state.call.startedAt
      ? Math.floor((Date.now() - state.call.startedAt) / 1000) : 0;
    postJSON('api/calls.php?action=log', {
      phone: state.call.phone,
      duration: dur,
      direction: state.call.dir,
      status: dur > 0 ? 'completed' : 'no-answer',
    }).catch(() => {});
    if (dur === 0 && cause && /busy/i.test(cause)) toast('Line busy.');
  }

  state.call = null;
  rtcCall = null;
  $('#call-card').hidden = true;
  $('#call-card').classList.remove('live', 'muted');
  $('#dial-idle').hidden = false;
  $('#minibar').hidden = true;
  $('#incoming-card').hidden = true;
  if (state.screen === 'recents') loadCalls();
}

$('#call-end').onclick = () => { try { rtcCall?.hangup(); } catch {} endCallUI(); };

$('#call-mute').onclick = () => {
  if (!rtcCall || !state.call) return;
  state.call.muted = !state.call.muted;
  try { state.call.muted ? rtcCall.muteAudio() : rtcCall.unmuteAudio(); } catch {}
  $('#call-mute').classList.toggle('active', state.call.muted);
  $('#call-card').classList.toggle('muted', state.call.muted);
  setCallStatus(state.call.muted ? 'Muted' : 'Connected', !state.call.muted);
};

$('#call-hold').onclick = async () => {
  if (!rtcCall || !state.call) return;
  const btn = $('#call-hold');
  try {
    if (state.call.held) { await rtcCall.unhold(); state.call.held = false; }
    else { await rtcCall.hold(); state.call.held = true; }
    btn.classList.toggle('active', state.call.held);
    btn.querySelector('span').textContent = state.call.held ? 'Resume' : 'Hold';
    setCallStatus(state.call.held ? 'On hold' : 'Connected', !state.call.held);
  } catch { toast('Could not change hold state.', 'err'); }
};

/* Call note — saved into the conversation so it lives with the client */
$('#call-note').onclick = () => {
  if (!state.call) return;
  const phone = state.call.phone;
  openSheet('Note for this call', `
    <label>Note
      <textarea id="cn-text" rows="4" placeholder="What was agreed, what to follow up on…"></textarea>
      <div class="field-hint">Saved privately on this device against this contact. Never sent to them, never leaves your browser.</div>
    </label>
    <button class="btn-primary" id="cn-save">Save note</button>
  `);
  setTimeout(() => $('#cn-text').focus(), 120);
  $('#cn-save').onclick = () => {
    const v = $('#cn-text').value.trim();
    if (!v) return toast('Write something first.', 'err');
    const notes = store.get('callnotes', {});
    (notes[phone] ||= []).push({ at: Date.now(), text: v });
    store.set('callnotes', notes);
    closeSheet();
    toast('Note saved', 'good');
  };
};

$('#call-message').onclick = () => {
  if (!state.call) return;
  if (!isDesktop()) show('messages');
  openThread(state.call.phone);
};

$('#call-keypad').onclick = () => {
  const d = $('#call-dtmf');
  if (d.hidden && !d.innerHTML) {
    d.innerHTML = ['1','2','3','4','5','6','7','8','9','*','0','#']
      .map(k => `<button data-dtmf="${k}">${k}</button>`).join('');
  }
  d.hidden = !d.hidden;
  $('#call-keypad').classList.toggle('active', !d.hidden);
};

$('#call-dtmf').addEventListener('click', e => {
  const b = e.target.closest('[data-dtmf]');
  if (!b) return;
  playDtmfTone(b.dataset.dtmf);
  if (rtcCall) { try { rtcCall.dtmf(b.dataset.dtmf); haptic(8); } catch {} }
});

function showIncoming(from, cnam) {
  const n = normalize(from);
  const c = state.contacts.find(x => x.phone === n);
  // priority: a name you've saved yourself > the network's caller ID name > just the number
  const netName = (cnam || '').trim();
  const display = c?.name || netName || pretty(n) || 'Unknown';

  state.call = { phone: n, display, dir: 'inbound', startedAt: null, muted: false };
  const av = $('#incoming-avatar');
  av.textContent = initials(c?.name || netName, n);
  av.style.setProperty('--av-bg', avColor(n));
  $('#incoming-name').textContent = display;
  $('#incoming-sub').textContent = (c?.name || netName) ? pretty(n) : '';
  $('#incoming-card').hidden = false;
  playRing();

  if (tabIsAway()) {
    activeNotif = systemNotify('Incoming call', display + ' — click to answer', { sticky: true });
  }
}

$('#incoming-answer').onclick = async () => {
  stopRing();
  $('#incoming-card').hidden = true;
  showCallScreen(state.call.display, state.call.phone, 'Connecting…',
                 state.contacts.find(x => x.phone === state.call.phone)?.name);
  if (!isDesktop()) show('keypad');
  try {
    const s = await navigator.mediaDevices.getUserMedia({ audio: micConstraints(), video: false });
    s.getTracks().forEach(t => t.stop());
  } catch {
    toast('Allow microphone access, then answer again.', 'err');
    endCallUI();
    return;
  }
  try { rtcCall?.answer({ audio: micConstraints(), video: false }); }
  catch { try { rtcCall?.answer(); } catch {} }
};

$('#incoming-decline').onclick = () => { try { rtcCall?.hangup(); } catch {} endCallUI(); };

/* ============================================================
   RINGTONE — original marimba-mallet-style tone, now in stereo with
   richer harmonic layering and a more polished melodic phrase.
   Note: Apple's stock ringtones are copyrighted compositions, so this
   is an original composition with a bright, warm bell/mallet timbre
   rather than a reproduction of any existing ringtone.
   ============================================================ */
let ringCtx, ringInt, ringGain;

/* A struck mallet note with three layered partials — a warm
   fundamental (the body), a shimmering near-octave (the bloom), and a
   bright top sparkle that decays almost instantly (the transient) —
   panned across the stereo field for width instead of a flat mono tone. */
function ringNote(t0, freq, dur, vol, master, pan) {
  const o  = ringCtx.createOscillator();
  const o2 = ringCtx.createOscillator();
  const o3 = ringCtx.createOscillator();
  const g  = ringCtx.createGain();
  const g2 = ringCtx.createGain();
  const g3 = ringCtx.createGain();

  let out = master;
  if (ringCtx.createStereoPanner) {
    const panner = ringCtx.createStereoPanner();
    panner.pan.value = pan || 0;
    panner.connect(master);
    out = panner;
  }

  o.type  = 'sine'; o.frequency.value  = freq;
  o2.type = 'sine'; o2.frequency.value = freq * 2.01;   // shimmering bloom
  o3.type = 'sine'; o3.frequency.value = freq * 4.02;   // bright top sparkle

  o.connect(g); o2.connect(g2); o3.connect(g3);
  g.connect(out); g2.connect(out); g3.connect(out);

  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  g2.gain.setValueAtTime(0.0001, t0);
  g2.gain.exponentialRampToValueAtTime(vol * 0.34, t0 + 0.004);
  g2.gain.exponentialRampToValueAtTime(0.0001, t0 + dur * 0.55);

  g3.gain.setValueAtTime(0.0001, t0);
  g3.gain.exponentialRampToValueAtTime(vol * 0.22, t0 + 0.002);
  g3.gain.exponentialRampToValueAtTime(0.0001, t0 + dur * 0.18);

  [o, o2, o3].forEach(osc => { osc.start(t0); osc.stop(t0 + dur + 0.06); });
}

function ringPhrase() {
  const t0 = ringCtx.currentTime + 0.02;

  const master = ringCtx.createGain();
  master.gain.value = 1.0;
  master.connect(ringGain);

  // a slightly denser, more spacious tail than a single flat delay
  const room = ringCtx.createDelay(0.6);
  room.delayTime.value = 0.17;
  const fb = ringCtx.createGain(); fb.gain.value = 0.22;
  const wet = ringCtx.createGain(); wet.gain.value = 0.38;
  room.connect(fb); fb.connect(room); room.connect(wet); wet.connect(ringGain);

  const bus = ringCtx.createGain();
  bus.connect(master); bus.connect(room);

  // Original warm rising arpeggio (C major triad + octave) resolving
  // into a soft two-note landing — panned across the stereo field.
  const notes = [
    [523.25,  0.00, 0.30, 0.46, -0.45], // C5
    [659.25,  0.10, 0.30, 0.44,  0.00], // E5
    [783.99,  0.20, 0.34, 0.46,  0.45], // G5
    [1046.50, 0.32, 0.58, 0.52,  0.00], // C6 — sustained peak
    [783.99,  0.90, 0.26, 0.34, -0.30], // G5 — soft landing
    [659.25,  1.02, 0.42, 0.36,  0.30], // E5 — resolve
  ];
  notes.forEach(([f, at, dur, v, pan]) => ringNote(t0 + at, f, dur, v, bus, pan));

  const sub = ringCtx.createOscillator();
  const sg = ringCtx.createGain();
  sub.type = 'sine'; sub.frequency.value = 130.81;
  sub.connect(sg); sg.connect(master);
  sg.gain.setValueAtTime(0.0001, t0);
  sg.gain.exponentialRampToValueAtTime(0.12, t0 + 0.05);
  sg.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.15);
  sub.start(t0); sub.stop(t0 + 1.25);
}

function playRing() {
  try {
    ringCtx = ringCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (ringCtx.state === 'suspended') ringCtx.resume().catch(() => {});
    if (!ringGain) { ringGain = ringCtx.createGain(); ringGain.connect(ringCtx.destination); }
    ringGain.gain.cancelScheduledValues(ringCtx.currentTime);
    ringGain.gain.setValueAtTime(1, ringCtx.currentTime);
    ringPhrase();
    ringInt = setInterval(() => {
      if (ringCtx.state === 'suspended') ringCtx.resume().catch(() => {});
      ringPhrase();
    }, 2400);
  } catch {}
  haptic([500, 260, 500, 260, 500]);
}

function stopRing() {
  clearInterval(ringInt);
  try { if (ringGain) ringGain.gain.setValueAtTime(0.0001, ringCtx.currentTime); } catch {}
  haptic(0);
}

/* ============================================================
   POLLING
   ============================================================ */

let pollTimer;
let prevUnreadMap = {};

async function poll() {
  try {
    const j = await api('api/messages.php?action=since&last_id=' + state.lastMsgId);
    if (j.ok && j.new > 0) {
      state.lastMsgId = j.max_id;
      if (state.activePhone && !$('#thread-view').hidden) {
        refreshThreadQuiet(state.activePhone);
      }

      const t = await api('api/messages.php?action=threads');
      if (t.ok) {
        const isViewingThisThread = state.screen === 'messages' && !document.hidden;
        t.threads.forEach(th => {
          try {
            const prev = prevUnreadMap[th.phone] || 0;
            const now = Number(th.unread || 0);
            const isOpenThread = isViewingThisThread && state.activePhone === th.phone;
            if (now > prev && !isOpenThread) {
              showMsgToast(th.display, th.phone, th.last_body, th.name);
              playMsgChime();
            }
            prevUnreadMap[th.phone] = now;
          } catch (err) { console.error('notify failed for', th.phone, err); }
        });

        state.threads = t.threads;
        try { renderThreads(); } catch (err) { console.error('renderThreads failed', err); }
        try { updateBadge(); } catch (err) { console.error('updateBadge failed', err); }

        if (tabIsAway()) {
          const u = t.threads.find(x => Number(x.unread) > 0);
          systemNotify(
            u ? u.display : 'New message',
            u ? u.last_body : 'Open the dialer to read it',
            { phone: u ? u.phone : null }
          );
          haptic(200);
        }
      } else {
        loadThreads();
      }
    } else if (j.ok) {
      state.lastMsgId = j.max_id;
    }
  } catch (err) { console.error('poll failed', err); }
  const interval = state.call ? 15000 : (document.hidden ? 20000 : 2000);
  pollTimer = setTimeout(poll, interval);
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) { clearTimeout(pollTimer); poll(); runScheduled(); clearTimeout(vmPollTimer); pollVoicemails(); }
});

/* ============================================================
   BOOT
   ============================================================ */

$('#minibar-end').onclick = (e) => {
  e.stopPropagation();
  try { rtcCall?.hangup(); } catch {}
  endCallUI();
};
$('#minibar').addEventListener('click', () => show('keypad'));

(function initAudioUI() {
  const sl = $('#vol-slider'), vv = $('#vol-val');
  if (!sl) return;
  sl.value = audioPrefs.volume;
  sl.style.setProperty('--vol', audioPrefs.volume + '%');
  if (vv) vv.textContent = audioPrefs.volume + '%';
  sl.addEventListener('input', () => {
    audioPrefs.volume = Number(sl.value);
    sl.style.setProperty('--vol', sl.value + '%');
    if (vv) vv.textContent = sl.value + '%';
    applyVolume();
  });
  applyVolume();
})();

on('#audio-settings', 'click', async () => {
  try {
    const st = await navigator.mediaDevices.getUserMedia({ audio: true });
    st.getTracks().forEach(t => t.stop());
  } catch {}
  const { mics, spks } = await listAudioDevices();
  const canPickSpk = typeof $('#remote-audio')?.setSinkId === 'function';

  const opts = (list, sel) => list.map((d, i) =>
    `<option value="${esc(d.deviceId)}" ${d.deviceId === sel ? 'selected' : ''}>${esc(d.label || ('Device ' + (i + 1)))}</option>`
  ).join('');

  openSheet('Audio settings', `
    <label>Microphone
      <select id="as-mic">
        <option value="">System default</option>${opts(mics, audioPrefs.micId)}
      </select>
    </label>
    <label>Speaker / output
      <select id="as-spk" ${canPickSpk ? '' : 'disabled'}>
        <option value="">System default</option>${opts(spks, audioPrefs.spkId)}
      </select>
    </label>
    ${canPickSpk ? '' : '<div class="field-hint">Your browser does not allow choosing an output device. On phones, use earbuds or a headset to avoid speakerphone.</div>'}
    <button class="btn-primary" id="as-save">Save settings</button>
    <button class="btn-ghost" id="as-test">Test microphone</button>
  `);

  on('#as-save', 'click', async () => {
    audioPrefs.micId = $('#as-mic').value;
    audioPrefs.spkId = $('#as-spk').value;
    await applySpeaker();
    closeSheet();
    toast('Audio settings saved', 'good');
  });

  on('#as-test', 'click', async () => {
    try {
      const st = await navigator.mediaDevices.getUserMedia({
        audio: $('#as-mic').value ? { deviceId: { exact: $('#as-mic').value } } : true
      });
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const src = ctx.createMediaStreamSource(st);
      const an = ctx.createAnalyser(); an.fftSize = 512;
      src.connect(an);
      const buf = new Uint8Array(an.frequencyBinCount);
      let peak = 0, n = 0;
      const iv = setInterval(() => {
        an.getByteTimeDomainData(buf);
        let mx = 0; for (const v of buf) mx = Math.max(mx, Math.abs(v - 128));
        peak = Math.max(peak, mx); n++;
        $('#as-test').textContent = 'Listening… ' + '\u2588'.repeat(Math.min(10, Math.round(mx / 6)));
        if (n > 30) {
          clearInterval(iv);
          st.getTracks().forEach(t => t.stop()); ctx.close();
          $('#as-test').textContent = peak > 8 ? 'Microphone works ✓' : 'No sound detected ✗';
          setTimeout(() => { const b = $('#as-test'); if (b) b.textContent = 'Test microphone'; }, 2500);
        }
      }, 100);
    } catch { toast('Could not open that microphone.', 'err'); }
  });
});

async function boot() {
  lamp('nocall', window.RTC_READY ? 'Starting…' : 'Calling not set up');
  show('messages');
  try { await loadContacts(); } catch {}
  try { await loadThreads(); } catch {}
  state.threads.forEach(t => { prevUnreadMap[t.phone] = Number(t.unread || 0); });
  try {
    const j = await api('api/messages.php?action=since&last_id=0');
    if (j.ok) state.lastMsgId = j.max_id;
  } catch {}
  poll();
  runScheduled();
  initRTC();
  try { await loadVoicemails(); } catch {}
  pollVoicemails();
  setTimeout(prefetchThreads, 6000);
}

boot();

})();
