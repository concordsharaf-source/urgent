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
    sound:  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6.5 8.5H3.5v7h3L11 19Z"/><path d="M15.5 9.5a4 4 0 0 1 0 5"/><path d="M18.5 6.5a8 8 0 0 1 0 11"/></svg>',
    speech: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6.5 8.5H3.5v7h3L11 19Z"/><path d="M15 9a4.5 4.5 0 0 1 0 6"/><path d="M18 6a9 9 0 0 1 0 12"/></svg>',
    key:    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="15.5" r="4.2"/><path d="m11.2 12.4 8.3-8.4 1.5 1.5-2 2 2 2-2 2-2-2-2 2"/></svg>',
    person: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/></svg>',
    screen: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="4" width="19" height="12.5" rx="2"/><path d="M8.5 20.5h7M12 16.5v4"/></svg>',
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

  var speech = {
    available: function () { return 'speechSynthesis' in window; },
    speak: function (text) {
      if (!this.available()) return;
      try {
        speechSynthesis.cancel();
        var u = new SpeechSynthesisUtterance(String(text));
        u.lang = 'ar-SA';
        u.rate = 0.98;
        u.pitch = 1;
        var voices = speechSynthesis.getVoices() || [];
        for (var i = 0; i < voices.length; i++) {
          if ((voices[i].lang || '').toLowerCase().indexOf('ar') === 0) { u.voice = voices[i]; break; }
        }
        speechSynthesis.speak(u);
      } catch (e) {}
    },
    stop: function () { try { speechSynthesis.cancel(); } catch (e) {} }
  };

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

  /* ===================== الجلسة (دخول المحررين) ===================== */
  function createSession(room, hours) {
    var K = LS + room + ':session';
    function get() {
      var s = lsGet(K, null);
      if (!s || !s.user || (s.exp && s.exp < Date.now())) { lsDel(K); return null; }
      return s;
    }
    function set(user, name) {
      var hours_ = Number(hours) > 0 ? Number(hours) : 12;
      lsSet(K, { user: user, name: name, at: Date.now(), exp: Date.now() + hours_ * 3600e3 });
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
    createAlerter: createAlerter, speech: speech,
    // نقل وبيانات
    createBus: createBus, loadMqtt: loadMqtt, createStore: createStore, createSession: createSession,
    // نصوص ونسخ
    copyText: copyText, cleanNewsText: cleanNewsText, countWords: countWords,
    ONLINE_TTL: ONLINE_TTL, PRESENCE_MS: PRESENCE_MS
  };
})();
