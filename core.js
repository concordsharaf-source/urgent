/* =========================================================================
   core.js — النواة المشتركة لغرفة الأخبار العاجلة
   تُستخدم من: index.html (شاشة الاستقبال للمنفذ) و send.html (لوحة المحررين)

   لا سيرفر ولا قاعدة بيانات: النقل يتم عبر WebSocket إلى وسيط MQTT عام،
   وكل خبر يُنشر كـ"رسالة محتجزة" (retained) فيقرأه كل من يفتح الشاشة لاحقاً.
   ========================================================================= */
window.URGENT = (function () {
  'use strict';

  var LS = 'ucn:';                       // بادئة مفاتيح التخزين المحلي
  var PBKDF2_ITER = 150000;              // قوة تجزئة كلمة المرور

  var DEFAULT_BROKERS = [
    { url: 'wss://broker.emqx.io:8084/mqtt',     name: 'EMQX' },
    { url: 'wss://broker.hivemq.com:8884/mqtt',  name: 'HiveMQ' },
    { url: 'wss://test.mosquitto.org:8081/mqtt', name: 'Mosquitto' }
  ];

  var ONLINE_TTL = 45000;                // صلاحية نبضة الحضور
  var PRESENCE_MS = 15000;               // دورية نبضة الحضور


  /* ===================== أيقونات SVG (بدل الإيموجي: تظهر بنفس الشكل على كل الأجهزة) ===================== */
  var ICONS = {
    copy:   '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5.5 15H5a1.5 1.5 0 0 1-1.5-1.5V5A1.5 1.5 0 0 1 5 3.5h8.5A1.5 1.5 0 0 1 15 5v.5"/></svg>',
    edit:   '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.6 3.4a2.1 2.1 0 0 1 3 3L7.5 18.5 3 20l1.5-4.5Z"/></svg>',
    pin:    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17.5V22"/><path d="M9 4h6v6.6l2 3.4H7l2-3.4Z"/></svg>',
    trash:  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 6.5h17"/><path d="M8.5 6.5V4h7v2.5"/><path d="M6 6.5 7 20h10l1-13.5"/><path d="M10.5 10.5v6M13.5 10.5v6"/></svg>',
    check:  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6.5 9.3 17.2 4 12"/></svg>',
    inbox:  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.5h-5.5L14 15h-4l-1.5-2.5H3"/><path d="M5.5 5h13l2.5 7.5V19H3v-6.5Z"/></svg>',
    clock:  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5.2l3.2 2"/></svg>',
    bell:   '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8.5a6 6 0 1 0-12 0c0 6.5-2.5 8.5-2.5 8.5h17S18 15 18 8.5"/><path d="M10.3 20.5a2 2 0 0 0 3.4 0"/></svg>',
    soundOff:'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6.5 8.5H3.5v7h3L11 19Z"/><path d="M16 9.5l4 5M20 9.5l-4 5"/></svg>',
    sound:  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6.5 8.5H3.5v7h3L11 19Z"/><path d="M15.5 9.5a4 4 0 0 1 0 5"/><path d="M18.5 6.5a8 8 0 0 1 0 11"/></svg>',
    key:    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="15.5" r="4.2"/><path d="m11.2 12.4 8.3-8.4 1.5 1.5-2 2 2 2-2 2-2-2-2 2"/></svg>',
    person: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/></svg>',
    screen: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="4" width="19" height="12.5" rx="2"/><path d="M8.5 20.5h7M12 16.5v4"/></svg>',
    chevron: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9.5 6 6 6-6"/></svg>',
    palette: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a9 9 0 1 0 0 18c1.3 0 2-.9 2-1.8 0-.6-.3-1-.6-1.4-.3-.4-.5-.8-.5-1.3 0-.9.8-1.6 1.7-1.6H16a5 5 0 0 0 5-5c0-4.4-4-7.9-9-7.9Z"/><circle cx="7.5" cy="11" r="1.2"/><circle cx="10" cy="7.5" r="1.2"/><circle cx="14.5" cy="7.5" r="1.2"/></svg>',
    frame:  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="4"/><rect x="7" y="7" width="10" height="10" rx="2" opacity=".45"/></svg>',
    speed:  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M12 20a8 8 0 1 1 8-8"/><path d="M12 12l4.5-4"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/></svg>',
    close:  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    info:   '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5.5"/><path d="M12 7.6h.01"/></svg>',
    gear:   '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7 19.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 13.6H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.7 7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 3V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
    wifi:   '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M2.5 8.5a15 15 0 0 1 19 0"/><path d="M5.5 12a11 11 0 0 1 13 0"/><path d="M8.5 15.5a6.5 6.5 0 0 1 7 0"/><path d="M12 19h.01"/></svg>',
    phone:  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2.5" width="12" height="19" rx="2.6"/><path d="M11 18.5h2"/></svg>',
    download:'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5v11"/><path d="m7.5 10.5 4.5 4.5 4.5-4.5"/><path d="M4 20.5h16"/></svg>',
    lock:   '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="4.5" y="10.5" width="15" height="10" rx="2.4"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/></svg>',
    expand: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3.5H5.5A2 2 0 0 0 3.5 5.5V8"/><path d="M16 3.5h2.5a2 2 0 0 1 2 2V8"/><path d="M8 20.5H5.5a2 2 0 0 1-2-2V16"/><path d="M16 20.5h2.5a2 2 0 0 0 2-2V16"/></svg>',
    warn:   '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 4.2 2.6 18a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z"/><path d="M12 9.5v4.5"/><path d="M12 17.5h.01"/></svg>',
    send:   '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12 20.5 4l-7 16-3-6.5-6.5-1.5Z"/></svg>',
    exit:   '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 21H5.5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 16.5 4.5-4.5L16 7.5"/><path d="M20.5 12h-11"/></svg>'
  };

  function ic(name, size) {
    var s = ICONS[name] || '';
    if (size) s = s.replace(/width="18" height="18"/, 'width="' + size + '" height="' + size + '"');
    return s;
  }

  // أيقونة كعنصر مستقل (بدون محتوى نصي)
  function iconEl(name, size) {
    var i = document.createElement('i');
    i.className = 'ico';
    i.innerHTML = ic(name, size);
    return i;
  }

  // تعبئة كل العناصر الوسومة بـ data-ic داخل الصفحة
  function hydrateIcons(root) {
    $$('[data-ic]', root || document).forEach(function (el) {
      el.innerHTML = ic(el.getAttribute('data-ic'), el.getAttribute('data-size') || null);
    });
  }

  // تعيين نص مؤمَّن + أيقونة داخل عنصر (يمنع أي احتمال حقن)
  function setIconText(el, iconName, text) {
    el.innerHTML = '';
    if (iconName) el.appendChild(iconEl(iconName));
    el.appendChild(document.createTextNode(text == null ? '' : String(text)));
  }

  /* ===================== أدوات عامة ===================== */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function fmtTime(ts) { var d = new Date(ts); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function fmtClock(ts) { var d = new Date(ts); return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()); }
  function fmtDate(ts) { var d = new Date(ts); return d.getDate() + '/' + (d.getMonth() + 1) + '/' + d.getFullYear(); }

  function rel(ts) {
    if (!ts) return '—';
    var s = Math.floor((Date.now() - ts) / 1000);
    if (s < 5) return 'الآن';
    if (s < 60) return 'قبل ' + s + ' ثانية';
    var m = Math.floor(s / 60);
    if (m < 60) return 'قبل ' + m + ' دقيقة';
    var h = Math.floor(m / 60);
    if (h < 24) return 'قبل ' + h + ' ساعة';
    var d = Math.floor(h / 24);
    if (d === 1) return 'أمس';
    if (d < 30) return 'قبل ' + d + ' يوم';
    return fmtDate(ts);
  }

  function txt(node, s) { node.textContent = (s == null ? '' : String(s)); return node; }

  function el(tag, cls, s) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (s != null) n.textContent = s;
    return n;
  }

  function b64(buf) {
    var bytes = new Uint8Array(buf), s = '', i, chunk = 0x8000;
    for (i = 0; i < bytes.length; i += chunk) s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    return btoa(s);
  }
  function unb64(str) {
    var bin = atob(String(str || '')), out = new Uint8Array(bin.length), i;
    for (i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function randToken(n) {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789', s = '', i;
    var arr = new Uint8Array(n || 24);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(arr);
    else for (i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
    for (i = 0; i < arr.length; i++) s += chars[arr[i] % chars.length];
    return s;
  }

  /* ===================== التشفير وكلمات المرور ===================== */
  function hasCrypto() { return !!(window.crypto && window.crypto.subtle && window.TextEncoder); }

  function hashPassword(password, saltB64) {
    if (!hasCrypto()) return Promise.reject(new Error('التشفير غير متاح — يجب فتح الصفحة عبر https أو localhost'));
    return crypto.subtle.importKey('raw', new TextEncoder().encode(String(password)), 'PBKDF2', false, ['deriveBits'])
      .then(function (key) {
        return crypto.subtle.deriveBits({ name: 'PBKDF2', salt: unb64(saltB64), iterations: PBKDF2_ITER, hash: 'SHA-256' }, key, 256);
      })
      .then(function (bits) { return b64(bits); });
  }

  function makeSalt() {
    var a = new Uint8Array(16);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(a);
    else for (var i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256);
    return b64(a);
  }

  function verifyPassword(password, admin) {
    if (!admin || !admin.salt || !admin.hash) return Promise.resolve(false);
    return hashPassword(password, admin.salt).then(function (h) {
      if (h.length !== admin.hash.length) return false;
      var diff = 0, i;
      for (i = 0; i < h.length; i++) diff |= h.charCodeAt(i) ^ admin.hash.charCodeAt(i);
      return diff === 0;
    }).catch(function () { return false; });
  }

  /* ===================== الإعدادات والمفاتيح ===================== */
  function config() { return window.URGENT_CONFIG || {}; }

  // الغرفة: من الرابط (#r=CODE) أو من ملف الإعدادات
  function resolveRoom() {
    var m = /(?:^|[#&?])r=([A-Za-z0-9_-]{6,64})/.exec(window.location.hash + '&' + window.location.search);
    var room = (m && m[1]) ? m[1] : config().room;
    return String(room || 'newsroom').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64) || 'newsroom';
  }

  function brokers() {
    var c = config();
    return (c.brokers && c.brokers.length) ? c.brokers : DEFAULT_BROKERS;
  }

  /* ===================== التخزين المحلي ===================== */
  function lsGet(k, def) {
    try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; }
  }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }

  /* ===================== تنبيهات واجهة ===================== */
  function toast(msg, kind, ms) {
    var t = document.getElementById('ucToast');
    if (!t) {
      t = el('div', 'uc-toast');
      t.id = 'ucToast';
      document.body.appendChild(t);
    }
    t.className = 'uc-toast show ' + (kind || 'ok');
    t.textContent = msg;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.className = 'uc-toast ' + (kind || 'ok'); }, ms || 3400);
  }

  function flashTitle(msg, base) {
    try {
      document.title = msg + ' • ' + (base || 'غرفة الأخبار');
      var h = function () {
        if (!document.hidden) { document.title = base || document.title; document.removeEventListener('visibilitychange', h); }
      };
      document.addEventListener('visibilitychange', h);
    } catch (e) {}
  }

  function browserNotify(title, body) {
    try {
      if (!('Notification' in window) || Notification.permission !== 'granted') return;
      var n = new Notification(title, { body: body, dir: 'rtl', lang: 'ar' });
      setTimeout(function () { try { n.close(); } catch (e) {} }, 8000);
    } catch (e) {}
  }
  function askNotify() {
    try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); } catch (e) {}
  }

  /* ===================== الصوت والقراءة ===================== */
  function createAlerter() {
    var ctx = null, unlocked = false;

    function ensure() {
      if (ctx) return ctx;
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { ctx = new AC(); } catch (e) { return null; }
      return ctx;
    }
    function unlock() {
      var c = ensure();
      if (!c) return;
      if (c.state === 'suspended') c.resume();
      unlocked = c.state === 'running';
      // تشغيل نغمة صامتة لفتح الصوت في بعض المتصفحات
      try {
        var o = c.createOscillator(), g = c.createGain();
        g.gain.value = 0.0001; o.connect(g); g.connect(c.destination);
        o.start(); o.stop(c.currentTime + 0.02);
      } catch (e) {}
    }
    function tone(freq, at, dur, vol) {
      var c = ctx, o = c.createOscillator(), g = c.createGain(), t0 = c.currentTime + at;
      o.type = 'triangle';
      o.frequency.setValueAtTime(freq, t0);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol || 0.22, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(c.destination);
      o.start(t0); o.stop(t0 + dur + 0.02);
    }
    function play(kind) {
      var c = ensure();
      if (!c) return;
      if (c.state === 'suspended') { c.resume(); }
      if (!ctx) return;
      try {
        if (kind === 'urgent') {
          tone(932, 0, 0.30, 0.24); tone(1244, 0.16, 0.30, 0.22);
          tone(932, 0.44, 0.28, 0.22); tone(1568, 0.62, 0.42, 0.20);
        } else if (kind === 'error') {
          tone(392, 0, 0.22, 0.20); tone(294, 0.18, 0.30, 0.18);
        } else {
          tone(880, 0, 0.16, 0.16); tone(1174, 0.14, 0.22, 0.14);
        }
      } catch (e) {}
    }
    return { unlock: unlock, play: play, ready: function () { return !!(ctx && ctx.state === 'running'); } };
  }

  /* ===================== ناقل الرسائل (MQTT عبر WebSocket) ===================== */
  function loadMqtt(cb) {
    if (window.mqtt) return cb(true);
    var urls = ['./mqtt.min.js',
      'https://cdn.jsdelivr.net/npm/mqtt@5.10.1/dist/mqtt.min.js',
      'https://unpkg.com/mqtt@5.10.1/dist/mqtt.min.js'];
    var i = 0;
    (function next() {
      if (window.mqtt) return cb(true);
      if (i >= urls.length) return cb(false);
      var s = document.createElement('script');
      s.src = urls[i++];
      s.onload = function () { window.mqtt ? cb(true) : next(); };
      s.onerror = next;
      document.head.appendChild(s);
    })();
  }

  /**
   * createBus — ناقل مشترك
   * opts: { base, role, who, name, onMessage(topic, data, isEmpty), onState(state, info) }
   * state: 'idle' | 'connecting' | 'connected' | 'offline' | 'failed'
   */
  function createBus(opts) {
    var base = opts.base;
    var getName = (typeof opts.name === 'function') ? opts.name : function () { return opts.name; };
    var brs = brokers();
    var state = 'idle';
    var client = null, idx = 0, deadSwitch = false, alive = false;
    var outbox = [];
    var pubPresence = function () {};

    function setState(s, info) {
      state = s;
      try { opts.onState && opts.onState(s, info || {}); } catch (e) {}
    }

    function publish(rel, payload, o) {
      o = o || {};
      var body = (payload === '' || payload == null) ? '' : (typeof payload === 'string' ? payload : JSON.stringify(payload));
      if (client && alive) {
        try { client.publish(base + rel, body, { qos: 0, retain: !!o.retain }); return true; } catch (e) {}
      }
      if (o.queue !== false) {
        outbox.push({ rel: rel, body: body, retain: !!o.retain });
        if (outbox.length > 80) outbox.shift();
        return false;
      }
      return false;
    }

    function flush() {
      while (outbox.length) {
        var m = outbox.shift();
        try { client.publish(base + m.rel, m.body, { qos: 0, retain: m.retain }); } catch (e) { outbox.unshift(m); break; }
      }
    }

    function connect(i) {
      idx = i;
      if (i >= brs.length) {
        setState('failed', {});
        setTimeout(function () { alive = false; connect(0); }, 12000);
        return;
      }
      var b = brs[i];
      var opened = false;
      setState('connecting', { broker: b.name });

      var c;
      try {
        c = window.mqtt.connect(b.url, {
          clientId: 'ucn_' + Math.random().toString(16).slice(2, 12),
          clean: true,
          keepalive: 30,
          connectTimeout: 9000,
          reconnectPeriod: 4000,
          protocolVersion: 4,
          will: { topic: base + 'presence/' + opts.who, payload: JSON.stringify({ off: 1, ts: 0 }), qos: 0, retain: true }
        });
      } catch (e) { return connect(i + 1); }

      client = c;
      alive = false;

      var guard = setTimeout(function () {
        if (!opened) { deadSwitch = true; try { c.end(true); } catch (e) {} connect(i + 1); }
      }, 11000);

      c.on('connect', function () {
        opened = true; alive = true; deadSwitch = false;
        clearTimeout(guard);
        setState('connected', { broker: b.name });
        c.subscribe([base + '#'], { qos: 0 }, function () {
          flush();
          pubPresence();
          try { opts.onReady && opts.onReady(); } catch (e) {}
        });
      });

      c.on('message', function (topic, payload) {
        var rel = topic.slice(base.length);
        var raw = payload ? payload.toString() : '';
        var data = null;
        if (raw) { try { data = JSON.parse(raw); } catch (e) { data = null; } }
        try { opts.onMessage && opts.onMessage(rel, data, raw === ''); } catch (e) {}
      });

      c.on('error', function () {
        if (!opened) { deadSwitch = true; clearTimeout(guard); try { c.end(true); } catch (e) {} connect(i + 1); }
      });

      c.on('close', function () {
        alive = false;
        if (!deadSwitch && client === c) {
          setState('offline', { broker: b.name });
          if (!outbox._warned) { outbox._warned = true; }
        }
      });
      c.on('offline', function () { alive = false; setState('offline', { broker: b.name }); });
    }

    /* نبضة حضور دورية */
    var timer = null;
    function startPresence() {
      pubPresence = function () {
        publish('presence/' + opts.who, { who: opts.who, role: opts.role, name: opts.name, ts: Date.now() },
          { retain: true, queue: false });
      };
      pubPresence();
      if (timer) clearInterval(timer);
      timer = setInterval(pubPresence, PRESENCE_MS);
      // حالة "خرج" عند إغلاق الصفحة
      window.addEventListener('beforeunload', function () { goOffline(); });
      window.addEventListener('pagehide', function () { goOffline(); });
      document.addEventListener('visibilitychange', function () { if (!document.hidden) pubPresence(); });
    }
    function goOffline() {
      try { publish('presence/' + opts.who, { who: opts.who, role: opts.role, name: opts.name, ts: 0, off: 1 }, { retain: true, queue: false }); } catch (e) {}
    }

    return {
      connect: function () {
        loadMqtt(function (ok) {
          if (!ok) { setState('failed', { reason: 'mqtt-load' }); return; }
          connect(0);
        });
      },
      startPresence: startPresence,
      publish: publish,
      state: function () { return state; },
      isAlive: function () { return alive; },
      reconnectNow: function () { if (client) { try { client.reconnect(); } catch (e) { connect(idx); } } else connect(0); },
      end: function () { goOffline(); try { clearInterval(timer); if (client) setTimeout(function () { try { client.end(true); } catch (e) {} }, 150); } catch (e) {} }
    };
  }

  /* ===================== مخزن الأخبار ===================== */
  /**
   * createStore — يحفظ الأخبار وإشاراتها (استلام/نسخ/تثبيت) في الذاكرة + localStorage
   * item = { id, text, author, ts, editedAt, ack:{kind,by,ts}, pin:{ts,by} }
   */
  function createStore(o) {
    o = o || {};
    var room = o.room || 'newsroom', limit = o.limit || 300, persist = o.persist !== false;
    var K = LS + room + ':';
    var items = {}, ids = {};
    var pendingAcks = {};   // إشارات وصلت قبل الخبر نفسه (ترتيب الرسائل)
    var events = {};

    function on(evt, cb) { (events[evt] = events[evt] || []).push(cb); }
    function emit(evt, d) { (events[evt] || []).forEach(function (f) { try { f(d); } catch (e) {} }); }

    function packed() {
      return Object.keys(items).map(function (k) { return items[k]; });
    }
    function save() {
      if (!persist) return;
      try {
        var arr = packed().sort(function (a, b) { return b.ts - a.ts; }).slice(0, limit);
        localStorage.setItem(K + 'news', JSON.stringify(arr));
      } catch (e) {}
    }
    function load() {
      if (!persist) return;
      var arr = lsGet(K + 'news', []) || [];
      arr.forEach(function (it) {
        if (!it || !it.id || !it.text) return;
        items[it.id] = it; ids[it.id] = true;
      });
      emit('change', {});
    }

    function applyNews(raw) {
      if (!raw || !raw.id || !raw.t) return null;
      var id = String(raw.id);
      var isNew = !items[id];
      var it = items[id] || (items[id] = { id: id, ack: null, pin: null });
      ids[id] = true;
      it.text = String(raw.t);
      it.author = raw.a ? String(raw.a) : 'المحرر';
      it.ts = Number(raw.ts) || Date.now();
      it.editedAt = raw.e ? Number(raw.e) : null;
      if (pendingAcks[id]) { it.ack = pendingAcks[id]; delete pendingAcks[id]; }
      save();
      if (isNew) { emit('add', it); }
      else { emit('update', it); }
      emit('change', { item: it, isNew: isNew });
      return { item: it, isNew: isNew };
    }

    function applyAck(raw) {
      if (!raw || !raw.id) return null;
      var it = items[raw.id];
      if (!it) {
        // وصلت الإشارة قبل الخبر: نحفظها ونطبّقها عند وصول الخبر
        pendingAcks[raw.id] = { kind: raw.k || 'copied', by: raw.b || 'المنفذ', ts: Number(raw.ts) || Date.now(), note: raw.n || '' };
        return null;
      }
      var prev = it.ack;
      it.ack = { kind: raw.k || 'copied', by: raw.b || 'المنفذ', ts: Number(raw.ts) || Date.now(), note: raw.n || '' };
      save();
      emit('ack', { item: it, prev: prev });
      emit('change', { item: it });
      return it;
    }

    function applyPin(raw, on_) {
      if (!raw || !raw.id) return null;
      var it = items[raw.id];
      if (!it) return null;
      it.pin = on_ ? { ts: Number(raw.ts) || Date.now(), by: raw.b || '' } : null;
      save();
      emit('pin', { item: it });
      emit('change', { item: it });
      return it;
    }

    function remove(id) {
      if (!items[id]) return false;
      delete items[id]; delete ids[id];
      save();
      emit('remove', { id: id });
      emit('change', {});
      return true;
    }

    function clearAll() {
      items = {}; ids = {};
      save();
      emit('change', {});
    }

    function list() {
      var arr = packed();
      arr.sort(function (a, b) {
        var pa = a.pin ? 1 : 0, pb = b.pin ? 1 : 0;
        if (pa !== pb) return pb - pa;
        if (pa && pb && a.pin.ts !== b.pin.ts) return b.pin.ts - a.pin.ts;
        return b.ts - a.ts;
      });
      return arr;
    }

    function stats() {
      var s = { total: 0, copied: 0, received: 0, pending: 0, pinned: 0 };
      packed().forEach(function (i) {
        s.total++;
        if (i.pin) s.pinned++;
        if (i.ack && i.ack.kind === 'copied') s.copied++;
        else if (i.ack && i.ack.kind === 'received') s.received++;
        else s.pending++;
      });
      return s;
    }

    return {
      on: on, applyNews: applyNews, applyAck: applyAck, applyPin: applyPin,
      remove: remove, clearAll: clearAll, list: list, stats: stats, save: save, load: load,
      get: function (id) { return items[id]; },
      has: function (id) { return !!ids[id]; },
      key: function (k) { return K + k; }
    };
  }


  /* ===================== تطبيق PWA + إشعارات Push ===================== */
  var pushState = {
    reg: null, sub: null, busy: false,
    handlers: { onSubscription: null }
  };

  function swSupported() {
    return ('serviceWorker' in navigator) && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1');
  }

  function registerSW() {
    try {
      if (!swSupported()) return Promise.resolve(null);
    } catch (e) { return Promise.resolve(null); }
    if (pushState.reg) return Promise.resolve(pushState.reg);
    return navigator.serviceWorker.register('./sw.js', { scope: './' }).then(function (reg) {
      pushState.reg = reg;
      // التحديث التلقائي عند وجود نسخة جديدة
      try { reg.update(); } catch (e) {}
      return reg;
    }).catch(function () { return null; });
  }

  function urlB64ToUint8(base64String) {
    var padding = '='.repeat((4 - base64String.length % 4) % 4);
    var base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    var raw = atob(base64);
    var out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  function notificationState() {
    try {
      if (typeof Notification === 'undefined' || !Notification) return 'unsupported';
      return Notification.permission || 'default';     // default | granted | denied
    } catch (e) { return 'unsupported'; }
  }

  function askNotifyPermission() {
    try {
      if (notificationState() !== 'default') return Promise.resolve(notificationState());
      return Notification.requestPermission().then(function (p) { return p; }).catch(function () { return 'denied'; });
    } catch (e) { return Promise.resolve('unsupported'); }
  }

  function pushSupported() {
    return swSupported() && ('PushManager' in window) && ('Notification' in window);
  }

  function pushPublicKey() {
    var c = config();
    return (c.push && c.push.publicKey) ? c.push.publicKey : '';
  }

  // تفعيل الاشتراك: تسجيل SW + إذن الإشعارات + الاشتراك بالإشعارات
  function enablePush() {
    if (!pushSupported()) return Promise.reject(new Error('الإشعارات في الخلفية غير مدعومة في هذا المتصفح. ثبّت الصفحة على الشاشة الرئيسية (أو استخدم Chrome/Edge على الكمبيوتر).'));
    pushState.busy = true;
    return registerSW().then(function (reg) {
      if (!reg) throw new Error('تعذّر تسجيل خدمة التطبيق (sw.js).');
      return askNotifyPermission();
    }).then(function (perm) {
      if (perm !== 'granted') throw new Error('تم رفض إذن الإشعارات من المتصفح.');
      return pushState.reg.pushManager.getSubscription();
    }).then(function (existing) {
      if (existing) { pushState.sub = existing; return existing; }
      var key = pushPublicKey();
      if (!key) throw new Error('مفتاح الإشعارات غير مهيأ في الإعدادات (config.js → push.publicKey).');
      return pushState.reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlB64ToUint8(key)
      });
    }).then(function (sub) {
      pushState.busy = false;
      pushState.sub = sub;
      return sub;
    });
  }

  function disablePush() {
    return (pushState.reg ? pushState.reg.pushManager.getSubscription() : Promise.resolve(null))
      .then(function (sub) { return sub ? sub.unsubscribe() : false; })
      .then(function () { pushState.sub = null; return true; })
      .catch(function () { return false; });
  }

  function pushStatus() {
    try {
      if (!swSupported()) return Promise.resolve({ supported: false, permission: notificationState(), subscribed: false, sub: null });
      var get = pushState.reg ? pushState.reg.pushManager.getSubscription() : Promise.resolve(null);
      return get.then(function (sub) {
        pushState.sub = sub;
        return { supported: pushSupported(), permission: notificationState(), subscribed: !!sub, sub: sub };
      }).catch(function () {
        return { supported: false, permission: notificationState(), subscribed: false, sub: null };
      });
    } catch (e) {
      return Promise.resolve({ supported: false, permission: notificationState(), subscribed: false, sub: null });
    }
  }

  // عرض إشعار عبر الـService Worker (يعمل في أندرويد أكثر من new Notification)
  function showViaSW(title, body, tag) {
    if (!pushState.reg || !navigator.serviceWorker.controller) return false;
    try {
      navigator.serviceWorker.controller.postMessage({ type: 'notify', title: title, body: body, tag: tag });
      return true;
    } catch (e) { return false; }
  }

  /* ===================== إدارة بيانات المحررين (الحسابات) ===================== */
  // القراءة: config.js (الأساس) + تعديلات محفوظة محلياً (تُطبَّق عند تطابق رمز الإعدادات)
  function adminsKey() { return LS + resolveRoom() + ':admins-override'; }

  /* المالكون: حسابات تدير كل المحررين. غيرهم يدير حسابه فقط. */
  function owners() {
    var o = config().owners;
    if (!o || !o.length) {
      var first = (config().admins || [])[0];
      o = first && first.user ? [first.user] : [];
    }
    return o.slice();
  }
  function isOwner(user) {
    if (!user) return false;
    return owners().some(function (u) { return String(u).toLowerCase() === String(user).toLowerCase(); });
  }

  function admins() {
    var base = (config().admins || []).slice();
    var ov = lsGet(adminsKey(), null);
    if (ov && ov.list && ov.byToken === config().settingsKey) return ov.list.slice();
    return base;
  }

  function findAdmin(user) {
    var list = admins();
    for (var i = 0; i < list.length; i++) if (list[i].user === user) return list[i];
    return null;
  }

  // توليد كود config.js من قائمة الحسابات
  function adminsToConfigCode(list, indent) {
    var pad = indent || '    ';
    return (list || []).map(function (a) {
      return pad + '{\n' +
        pad + '  user: ' + JSON.stringify(a.user) + ',\n' +
        pad + '  name: ' + JSON.stringify(a.name || a.user) + ',\n' +
        pad + '  salt: ' + JSON.stringify(a.salt) + ',\n' +
        pad + '  hash: ' + JSON.stringify(a.hash) + '\n' +
        pad + '}';
    }).join(',\n');
  }

  /* ---------- توليد كلمة مرور قوية وسهلة القراءة ---------- */
  function makePassword(len) {
    var n = Math.max(8, Math.min(32, len || 12));
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    var a = new Uint8Array(n);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(a);
    else for (var j = 0; j < n; j++) a[j] = Math.floor(Math.random() * 256);
    var out = '';
    for (var i = 0; i < n; i++) out += chars.charAt(a[i] % chars.length);
    return out;
  }

  /* ---------- الحفظ الدائم في المستودع (GitHub Contents API) ---------- */
  function ghTokenGet() { return lsGet(LS + 'gh-token', ''); }
  function ghTokenSet(t) { lsSet(LS + 'gh-token', String(t || '').trim()); }
  function ghInfo() {
    var gh = config().github || {};
    return { owner: gh.owner || '', repo: gh.repo || '', path: gh.path || 'config.js', branch: gh.branch || 'main' };
  }
  function utf8ToB64(str) { return btoa(unescape(encodeURIComponent(String(str)))); }
  function b64ToUtf8(b64) {
    var bin = atob(String(b64).replace(/\s/g, ''));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  // استبدال قسم admins في نص config.js بلا هدم بقية الملف
  function replaceAdminsBlock(text, list) {
    var startKey = text.indexOf('admins:');
    if (startKey < 0) throw new Error('لم أجد قسم admins في config.js');
    var open = text.indexOf('[', startKey);
    if (open < 0) throw new Error('تنسيق config.js غير متوقع');
    var close = text.indexOf('\n  ]', open);
    if (close < 0) throw new Error('لم أجد نهاية قسم admins');
    return text.slice(0, open + 1) + '\n' + adminsToConfigCode(list, '    ') + '\n  ' + text.slice(close + 3);
  }
  // يحفظ قائمة المحررين في config.js داخل المستودع مباشرةً
  function gitSaveAdmins(list, token) {
    var gh = ghInfo();
    var tk = String(token || ghTokenGet() || '').trim();
    if (!tk) return Promise.reject(new Error('لا يوجد رمز GitHub — الصقه أولاً'));
    if (!gh.owner || !gh.repo) return Promise.reject(new Error('معلومات المستودع غير مهيأة في config.js'));
    var api = 'https://api.github.com/repos/' + gh.owner + '/' + gh.repo + '/contents/' + gh.path;
    var headers = {
      'Authorization': 'Bearer ' + tk,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    };
    return fetch(api + '?ref=' + encodeURIComponent(gh.branch), { headers: headers })
      .then(function (r) {
        if (!r.ok) throw new Error(r.status === 401 ? 'الرمز غير صالح أو منتهي' : r.status === 404 ? 'لم أجد config.js في المستودع' : 'فشل قراءة الملف (' + r.status + ')');
        return r.json();
      })
      .then(function (data) {
        var current = b64ToUtf8(data.content);
        var updated = replaceAdminsBlock(current, list);
        if (updated === current) return { changed: false };
        return fetch(api, {
          method: 'PUT', headers: headers,
          body: JSON.stringify({
            message: 'تحديث بيانات المحررين (' + (list || []).length + ' محرر)',
            content: utf8ToB64(updated), sha: data.sha, branch: gh.branch
          })
        }).then(function (r2) {
          if (!r2.ok) throw new Error('فشل الحفظ (' + r2.status + ') — تأكد أن الرمز يملك صلاحية Contents: Read and write');
          return r2.json();
        }).then(function (res) {
          ghTokenSet(tk);
          return { changed: true, commit: (res && res.commit && res.commit.sha) ? res.commit.sha.slice(0, 7) : '' };
        });
      });
  }

  // حفظ محلياً (يطبَّق على هذا الجهاز فوراً)
  function saveAdminsLocal(list) {
    lsSet(adminsKey(), { list: list, byToken: config().settingsKey, ts: Date.now() });
    return true;
  }

  function resetAdminsLocal() { lsDel(adminsKey()); }

  /* ---------- كلمة مرور أداة إدارة المحررين ---------- */
  function toolsGateOverrideKey() { return LS + resolveRoom() + ':toolsGate'; }

  function toolsGate() {
    var ov = lsGet(toolsGateOverrideKey(), null);
    if (ov && ov.salt && ov.hash && ov.byToken === config().settingsKey) return { salt: ov.salt, hash: ov.hash };
    var g = config().toolsGate || {};
    return { salt: g.salt || '', hash: g.hash || '' };
  }

  function setToolsGateLocal(salt, hash) {
    lsSet(toolsGateOverrideKey(), { salt: salt, hash: hash, byToken: config().settingsKey, ts: Date.now() });
  }

  /* ---------- أمر «حدّث من المستودع»: يلغي النسخ المحلي في كل الأجهزة ---------- */
  function publishAdminsReset(bus) {
    try {
      bus.publish('cfg/admins', { reset: true, ts: Date.now() }, { retain: true });
      return true;
    } catch (e) { return false; }
  }

  /* ---------- نشر قائمة الحسابات لكل الأجهزة (بلا أي رمز مطلوب من المستخدم) ---------- */
  function publishAdmins(bus, list, by) {
    try {
      bus.publish('cfg/admins', { k: config().settingsKey || '', list: list, by: by || '', ts: Date.now() }, { retain: true });
      return true;
    } catch (e) { return false; }
  }

  function roomKey() { return resolveRoom(); }

  // تغيير كلمة مرور/اسم محرر: يعيد قائمة جديدة
  function changeAdmin(list, user, opts) {
    opts = opts || {};
    var out = (list || []).slice();
    var idx = -1, i;
    for (i = 0; i < out.length; i++) if (out[i].user === user) idx = i;
    var salt = makeSalt();
    return hashPassword(opts.password || '', salt).then(function (hash) {
      var entry = {
        user: user,
        name: opts.name || (idx >= 0 ? out[idx].name : user),
        salt: salt,
        hash: hash
      };
      if (idx >= 0) out[idx] = entry; else out.push(entry);
      return out;
    });
  }


  /* ===================== نوافذ (Modal) وواجهة الإعدادات ===================== */
  var installPrompt = null;      // يُملأ عند توفّر دعوة تثبيت PWA

  function initInstallCapture() {
    try {
      window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      installPrompt = e;
      var b = document.getElementById('ucInstallBtn');
      if (b) b.classList.remove('hidden');
    });
      window.addEventListener('appinstalled', function () {
        installPrompt = null;
        toast('تم تثبيت التطبيق على الجهاز', 'ok');
      });
    } catch (e) {}
  }
  function isStandalone() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      (window.navigator && (navigator.standalone === true)) ||
      (document.referrer || '').indexOf('android-app://') === 0;
  }
  function promptInstall() {
    if (installPrompt) {
      var e = installPrompt;
      installPrompt = null;
      try { e.prompt(); } catch (err) {}
      return true;
    }
    return false;
  }

  function openModal(node) {
    var back = document.getElementById('ucModal');
    if (!back) {
      back = el('div', 'uc-modal-back');
      back.id = 'ucModal';
      back.addEventListener('click', function (e) { if (e.target === back) closeModal(); });
      document.body.appendChild(back);
    }
    back.innerHTML = '';
    back.appendChild(node);
    back.classList.add('show');
    document.body.classList.add('uc-modal-open');
    return back;
  }
  function closeModal() {
    var back = document.getElementById('ucModal');
    if (back) { back.classList.remove('show'); }
    document.body.classList.remove('uc-modal-open');
    document.dispatchEvent(new CustomEvent('uc-modal-closed'));
  }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModal(); });

  function sheetEl() { return el('div', 'uc-sheet'); }
  function sheetHead(title, subtitle) {
    var h = el('div', 'uc-sheet-head');
    var t = el('div', 'uc-sheet-titles');
    t.appendChild(el('h3', null, title));
    if (subtitle) t.appendChild(el('p', null, subtitle));
    h.appendChild(t);
    var x = el('button', 'uc-sheet-x'); x.type = 'button'; x.innerHTML = ic('close', 20);
    x.setAttribute('aria-label', 'إغلاق');
    x.addEventListener('click', closeModal);
    h.appendChild(x);
    return h;
  }
  function rowEl(label, hint) {
    var r = el('div', 'uc-row');
    var t = el('div', 'uc-row-t');
    t.appendChild(el('div', 'uc-row-l', label));
    if (hint) t.appendChild(el('div', 'uc-row-h', hint));
    r.appendChild(t);
    return r;
  }
  function switchEl(on, onChange) {
    var b = el('button', 'uc-switch' + (on ? ' on' : ''));
    b.type = 'button';
    b.setAttribute('role', 'switch');
    b.setAttribute('aria-checked', on ? 'true' : 'false');
    b.appendChild(el('i'));
    b.addEventListener('click', function () {
      var now = !b.classList.contains('on');
      b.classList.toggle('on', now);
      b.setAttribute('aria-checked', now ? 'true' : 'false');
      onChange(now);
    });
    return b;
  }
  function btnEl(label, cls, icon) {
    var b = el('button', 'uc-btn ' + (cls || '')); b.type = 'button';
    if (icon) b.innerHTML = ic(icon, 18) + label; else b.textContent = label;
    return b;
  }
  function section(title, icon) {
    var s = el('div', 'uc-sec');
    var h = el('div', 'uc-sec-h');
    if (icon) h.innerHTML = ic(icon, 18);
    h.appendChild(document.createTextNode(title));
    s.appendChild(h);
    return s;
  }


  /* ---------- قسم مطوي بزر (Disclosure) ---------- */
  function collapsible(title, icon, subtitle, opts) {
    opts = opts || {};
    var wrap = el('div', 'uc-sec uc-collapsed' + (opts.open ? '' : ''));
    var head = el('button', 'uc-coll-head');
    head.type = 'button';
    var hIco = el('span', 'uc-coll-ico');
    if (icon) hIco.innerHTML = ic(icon, 18);
    head.appendChild(hIco);
    var hTxt = el('div', 'uc-coll-txt');
    hTxt.appendChild(el('div', 'uc-coll-title', title));
    if (subtitle) hTxt.appendChild(el('div', 'uc-coll-sub', subtitle));
    head.appendChild(hTxt);
    var arrow = el('span', 'uc-coll-arrow');
    arrow.innerHTML = ic('chevron', 18);
    head.appendChild(arrow);
    wrap.appendChild(head);

    var body = el('div', 'uc-coll-body');
    wrap.appendChild(body);
    if (opts.open) wrap.classList.add('open');
    head.addEventListener('click', function () {
      wrap.classList.toggle('open');
      if (typeof opts.onToggle === 'function') opts.onToggle(wrap.classList.contains('open'));
    });
    return { wrap: wrap, body: body, head: head, setOpen: function (v) { wrap.classList.toggle('open', !!v); } };
  }

  /* ---------- مِزلاق (range) بمعاينة رقمية ---------- */
  function slider(range) {
    var wrap = el('div', 'uc-slider');
    var inp = el('input');
    inp.type = 'range';
    inp.min = String(range.min); inp.max = String(range.max);
    inp.step = String(range.step || 1);
    inp.value = String(range.value);
    var out = el('span', 'uc-slider-val');
    function show(v) { out.textContent = v + (range.unit || ''); }
    show(range.value);
    inp.addEventListener('input', function () {
      var v = Number(inp.value);
      show(v);
      if (range.onInput) range.onInput(v);
    });
    wrap.appendChild(inp);
    wrap.appendChild(out);
    return { wrap: wrap, input: inp, set: function (v) { inp.value = String(v); show(v); } };
  }

  /* ---------- لوحة ألوان جاهزة + لون مخصص ---------- */
  var EDGE_COLORS = ['#ff2d2d', '#ff7a18', '#ffd400', '#22c55e', '#0ea5e9', '#8b5cf6', '#ec4899', '#ffffff'];
  function colorPicker(colors, value, onPick) {
    var wrap = el('div', 'uc-colors');
    var current = value || colors[0];
    var dots = [];
    function sync(v) {
      current = v;
      dots.forEach(function (d) { d.classList.toggle('active', d.getAttribute('data-c') === v); });
      custom.value = /^#[0-9a-f]{6}$/i.test(v) ? v : custom.value;
    }
    colors.forEach(function (c) {
      var d = el('button', 'uc-color');
      d.type = 'button';
      d.setAttribute('data-c', c);
      d.style.background = c;
      d.title = c;
      d.addEventListener('click', function () { sync(c); onPick(c); });
      dots.push(d);
      wrap.appendChild(d);
    });
    var custom = el('input', 'uc-color-custom');
    custom.type = 'color';
    custom.value = /^#[0-9a-f]{6}$/i.test(current) ? current : colors[0];
    custom.title = 'لون مخصص';
    custom.addEventListener('input', function () { sync(custom.value); onPick(custom.value); });
    wrap.appendChild(custom);
    sync(current);
    return { wrap: wrap, get: function () { return current; }, set: sync };
  }

  /**
   * buildSettings — واجهة إعدادات جاهزة تُبنى في الصفحة
   * opts: {
   *   title, subtitle,
   *   state: { sound, speak, speakVoice, alarmRepeat, alarmEvery, notifyRepeat, fontScale },
   *   onChange(key, value),
   *   showDisplay: true,            // إظهار قسم حجم الخط
   *   onSpeakTest(), 
   *   extra: [elements]             // أقسام إضافية (مثل إعدادات المحررين)
   * }
   */
  function buildSettings(opts) {
    var st = opts.state || {};
    var sheet = sheetEl();
    sheet.appendChild(sheetHead(opts.title || 'الإعدادات', opts.subtitle || ''));

    var body = el('div', 'uc-sheet-body');

    /* ---- الأقسام الإضافية أولاً (مثل بيانات دخول المحررين) ---- */
    (opts.extra || []).forEach(function (n) { body.appendChild(n); });

    /* ---- قسم الإشعارات ---- */
    var secN = section('الإشعارات', 'bell');
    var permRow = rowEl('إشعارات النظام', 'إشعارات تظهر خارج المتصفح (في شريط النظام)');
    var permState = el('div', 'uc-badge');
    var permBtn = btnEl('تفعيل', 'primary', 'bell');
    permRow.appendChild(permState);
    permRow.appendChild(permBtn);
    secN.appendChild(permRow);

    var bgRow = rowEl('الإشعارات والتطبيق مغلق', 'تعمل عبر سيرفر إشعارات (Web Push) — انظر تعليمات الإعداد');
    var bgState = el('div', 'uc-badge');
    var bgBtn = btnEl('تفعيل', 'primary', 'wifi');
    bgRow.appendChild(bgState); bgRow.appendChild(bgBtn);
    secN.appendChild(bgRow);

    var repRow = rowEl('تكرار الإشعار ما دام الخبر غير منسوخ', 'يُعاد الإشعار كل ' + (st.alarmEvery || 30) + ' ثانية');
    repRow.appendChild(switchEl(st.notifyRepeat !== false, function (v) { opts.onChange('notifyRepeat', v); refresh(); }));
    secN.appendChild(repRow);
    body.appendChild(secN);

    /* ---- قسم الصوت والتنبيه ---- */
    var secS = section('الصوت والتنبيه', 'sound');
    var sndRow = rowEl('تنبيه صوتي عند وصول خبر', 'نغمة مميزة للأخبار العاجلة');
    sndRow.appendChild(switchEl(st.sound !== false, function (v) { opts.onChange('sound', v); }));
    secS.appendChild(sndRow);

    var alarmRow = rowEl('تكرار التنبيه حتى يتم النسخ', 'يستمر كل ' + (st.alarmEvery || 30) + ' ثانية حتى يضغط المنفذ زر النسخ');
    alarmRow.appendChild(switchEl(st.alarmRepeat !== false, function (v) { opts.onChange('alarmRepeat', v); }));
    secS.appendChild(alarmRow);

    body.appendChild(secS);

    /* ---- قسم حجم الخط ---- */
    if (opts.showDisplay) {
      var secD = section('حجم الخط على الشاشة', 'screen');
      var fsRow = rowEl('حجم نص الأخبار', 'اضبطه حسب حجم شاشة غرفة التنفيذ');
      var minus = btnEl('A−', 'ghost'); var plus = btnEl('A+', 'ghost'); var reset = btnEl('افتراضي', 'ghost');
      var fsVal = el('span', 'uc-badge');
      function updFs() {
        fsVal.textContent = Math.round((st.fontScale || 1) * 100) + '%';
        opts.onChange('fontScale', st.fontScale);
      }
      minus.addEventListener('click', function () { st.fontScale = Math.max(0.6, Math.round((st.fontScale - 0.05) * 100) / 100); updFs(); });
      plus.addEventListener('click', function () { st.fontScale = Math.min(1.8, Math.round((st.fontScale + 0.05) * 100) / 100); updFs(); });
      reset.addEventListener('click', function () { st.fontScale = (config().display && config().display.fontScale) || 0.9; updFs(); });
      var fa = el('div', 'uc-row-actions'); fa.appendChild(minus); fa.appendChild(fsVal); fa.appendChild(plus); fa.appendChild(reset);
      fsRow.appendChild(fa);
      secD.appendChild(fsRow);
      body.appendChild(secD);
      updFs();
    }

    /* ---- قسم التطبيق ---- */
    var secA = section('تطبيق الجوال (PWA)', 'phone');
    var instRow = rowEl(isStandalone() ? 'التطبيق مثبَّت على هذا الجهاز' : 'تثبيت شاشة الأخبار كتطبيق',
      isStandalone() ? '' : (swSupported() ? 'يعمل بدون متصفح، ويدعم الإشعارات والتشغيل السريع' : 'يتطلب فتح الصفحة عبر رابط https'));
    var instBtn = btnEl('تثبيت', 'primary', 'download');
    instBtn.addEventListener('click', function () {
      if (isStandalone()) { toast('التطبيق مثبَّت بالفعل', 'ok'); return; }
      if (!promptInstall()) {
        toast('من قائمة المتصفح: «إضافة إلى الشاشة الرئيسية» (آيفون: زر المشاركة ← إضافة إلى الشاشة)', 'warn', 7000);
      }
    });
    instRow.appendChild(instBtn);
    secA.appendChild(instRow);

    var swRow = rowEl('حالة خدمة التطبيق', 'مطلوبة للإشعارات في الخلفية');
    var swState = el('div', 'uc-badge');
    swRow.appendChild(swState);
    secA.appendChild(swRow);
    body.appendChild(secA);

    /* ---- معلومات ---- */
    var secI = section('معلومات', 'info');
    var verRow = rowEl('الإصدار', 'رقم إصدار الصفحة الحالي');
    verRow.appendChild(el('div', 'uc-badge', 'v' + (config().version || '—')));
    secI.appendChild(verRow);
    body.appendChild(secI);

    sheet.appendChild(body);

    function refresh() {
      try { refreshInner(); } catch (e) {}
    }
    function refreshInner() {
      // حالة إشعارات النظام
      var ns = notificationState();
      permState.textContent = ns === 'granted' ? 'مفعّلة' : ns === 'denied' ? 'مرفوضة من المتصفح' : 'غير مفعّلة';
      permState.className = 'uc-badge ' + (ns === 'granted' ? 'ok' : ns === 'denied' ? 'bad' : '');
      permBtn.classList.toggle('hidden', ns === 'granted');
      permBtn.textContent = ns === 'denied' ? 'مرفوضة — افتح إعدادات المتصفح' : 'تفعيل';

      // حالة SW
      swState.textContent = !swSupported() ? 'غير مدعومة (تحتاج https)'
        : (navigator.serviceWorker.controller ? 'تعمل' : 'قيد التهيئة');
      swState.className = 'uc-badge ' + (navigator.serviceWorker.controller ? 'ok' : '');

      if (typeof opts.statusRefresh === 'function') opts.statusRefresh();
    }

    permBtn.addEventListener('click', function () {
      askNotifyPermission().then(function (p) {
        if (p === 'granted') { toast('تم تفعيل إشعارات النظام', 'ok'); try { showViaSW('تم التفعيل', 'ستصلك إشعارات الأخبار العاجلة'); } catch (e) {} }
        else toast('لم يتم منح الإذن — من إعدادات المتصفح: السماح بالإشعارات', 'warn', 6000);
        refresh();
      });
    });
    bgBtn.addEventListener('click', function () {
      bgBtn.disabled = true; bgState.textContent = 'جارٍ التفعيل…';
      enablePush().then(function (sub) {
        bgState.textContent = 'مفعّلة'; bgState.className = 'uc-badge ok';
        bgBtn.textContent = 'إيقاف';
        toast('تم تفعيل الإشعارات في الخلفية على هذا الجهاز', 'ok');
        if (typeof opts.onPushSubscribed === 'function') opts.onPushSubscribed(sub);
        else if (opts.onPush) opts.onPush();
      }).catch(function (err) {
        bgState.textContent = 'غير مفعّلة'; bgState.className = 'uc-badge bad';
        bgBtn.textContent = 'تفعيل';
        toast(err.message || 'تعذّر التفعيل', 'warn', 8000);
      }).then(function () { bgBtn.disabled = false; });
    });

    if (opts.onPush) {
      // يُستخدم من الصفحة لنشر الاشتراك في القناة
      pushStatus().then(function (r) {
        bgState.textContent = r.subscribed ? 'مفعّلة' : (r.supported ? 'غير مفعّلة' : 'غير مدعومة');
        bgState.className = 'uc-badge ' + (r.subscribed ? 'ok' : '');
        bgBtn.textContent = r.subscribed ? 'إيقاف' : 'تفعيل';
        if (r.subscribed) opts.onPush(r.sub);
      });
      bgBtn.addEventListener('click', function () {
        pushStatus().then(function (r) {
          if (r.subscribed) {
            disablePush().then(function () {
              bgState.textContent = 'غير مفعّلة'; bgState.className = 'uc-badge';
              bgBtn.textContent = 'تفعيل';
              toast('تم إيقاف الإشعارات في الخلفية على هذا الجهاز', 'ok');
              if (opts.onPushOff) opts.onPushOff();
            });
          }
        });
      });
    }

    refresh();
    return sheet;
  }

  /* ===================== الجلسة (دخول المحررين) ===================== */
  /* جلسة دائمة افتراضياً: تبقى حتى «تسجيل الخروج» فقط.
     يمكن تقييدها بساعات عبر تمرير عدد ساعات صحيح (> 0). */
  var SESSION_FOREVER = 100 * 365.25 * 24 * 3600e3;   // 100 سنة
  function createSession(room, hours) {
    var K = LS + room + ':session';
    function get() {
      var s = lsGet(K, null);
      if (!s || !s.user || (s.exp && s.exp < Date.now())) { lsDel(K); return null; }
      return s;
    }
    function set(user, name) {
      var h = Number(hours);
      var exp = (isFinite(h) && h > 0) ? Date.now() + h * 3600e3 : Date.now() + SESSION_FOREVER;
      lsSet(K, { user: user, name: name, at: Date.now(), exp: exp, forever: !(isFinite(h) && h > 0) });
    }
    function clear() { lsDel(K); }
    return { get: get, set: set, clear: clear };
  }

  /* ===================== النسخ إلى الحافظة ===================== */
  function copyText(text) {
    var s = String(text == null ? '' : text);
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        var p = navigator.clipboard.writeText(s);
        if (p && typeof p.then === 'function') {
          return p.then(function () { return true; }, function () { return legacyCopy(s); });
        }
      }
    } catch (e) { /* المتابعة للطريقة البديلة */ }
    return Promise.resolve(legacyCopy(s));
  }
  function legacyCopy(s) {
    try {
      var ta = document.createElement('textarea');
      ta.value = s;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed'; ta.style.top = '-1000px'; ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { ta.setSelectionRange(0, ta.value.length); } catch (e) {}
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      return !!ok;
    } catch (e) { return false; }
  }

  /* ===================== تنسيق النصوص ===================== */
  // تنظيف النص العاجل: توحيد المسافات والأسطر مع الحفاظ على الأسطر
  function cleanNewsText(s) {
    return String(s || '')
      .replace(/\r\n?/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function countWords(s) {
    var t = String(s || '').trim();
    if (!t) return 0;
    return t.split(/\s+/).length;
  }

  /* ===================== تصدير ===================== */
  return {
    // أدوات
    $: $, $$: $$, uid: uid, el: el, txt: txt,
    fmtTime: fmtTime, fmtClock: fmtClock, fmtDate: fmtDate, rel: rel,
    ic: ic, iconEl: iconEl, hydrateIcons: hydrateIcons, setIconText: setIconText,
    b64: b64, unb64: unb64, randToken: randToken, makeSalt: makeSalt,
    hashPassword: hashPassword, verifyPassword: verifyPassword, hasCrypto: hasCrypto,
    // إعدادات
    config: config, room: resolveRoom, brokers: brokers,
    // تخزين
    lsGet: lsGet, lsSet: lsSet, lsDel: lsDel, LS_PREFIX: LS,
    // واجهة
    toast: toast, flashTitle: flashTitle, browserNotify: browserNotify, askNotify: askNotify,
    // نوافذ وإعدادات
    openModal: openModal, closeModal: closeModal, buildSettings: buildSettings,
    isStandalone: isStandalone, promptInstall: promptInstall, initInstallCapture: initInstallCapture,
    section: section, rowEl: rowEl, switchEl: switchEl, btnEl: btnEl, sheetEl: sheetEl, sheetHead: sheetHead,
    collapsible: collapsible, slider: slider, colorPicker: colorPicker, EDGE_COLORS: EDGE_COLORS,
    publishAdmins: publishAdmins, publishAdminsReset: publishAdminsReset, toolsGate: toolsGate, toolsGateOverrideKey: toolsGateOverrideKey,
    makePassword: makePassword, isOwner: isOwner, owners: owners,
    ghTokenGet: ghTokenGet, ghTokenSet: ghTokenSet, ghInfo: ghInfo,
    gitSaveAdmins: gitSaveAdmins, replaceAdminsBlock: replaceAdminsBlock,
    createAlerter: createAlerter,
    // PWA وPush
    swSupported: swSupported, registerSW: registerSW, pushSupported: pushSupported,
    enablePush: enablePush, disablePush: disablePush, pushStatus: pushStatus,
    notificationState: notificationState, askNotifyPermission: askNotifyPermission,
    showViaSW: showViaSW, urlB64ToUint8: urlB64ToUint8,
    // إدارة الحسابات
    admins: admins, findAdmin: findAdmin, saveAdminsLocal: saveAdminsLocal, resetAdminsLocal: resetAdminsLocal,
    changeAdmin: changeAdmin, adminsToConfigCode: adminsToConfigCode, roomKey: roomKey,
    // نقل وبيانات
    createBus: createBus, loadMqtt: loadMqtt, createStore: createStore, createSession: createSession,
    // نصوص ونسخ
    copyText: copyText, cleanNewsText: cleanNewsText, countWords: countWords,
    ONLINE_TTL: ONLINE_TTL, PRESENCE_MS: PRESENCE_MS
  };
})();
