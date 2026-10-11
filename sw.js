/* =========================================================================
   sw.js — Service Worker لتطبيق «اليمن اليوم — غرفة الأخبار»
   المهام:
     1) تفعيل تثبيت التطبيق على الجوال والكمبيوتر (PWA).
     2) استقبال إشعارات Web Push وعرضها حتى لو كان التطبيق مغلقاً.
     3) فتح شاشة الاستقبال عند الضغط على الإشعار.
   صفحة الفتح تُحفظ على الجهاز وتُعرض فوراً حتى لا تبقى صورة الانتظار — لكن بعد مهلة قصيرة من الشبكة
   (NET_RACE_MS) حتى لا تُخدَم نسخة قديمة مع كود جديد.
   config.js يبقى من الشبكة حتى يُكتشف الإصدار الجديد.
   ========================================================================= */

/* مهلة انتظار الشبكة لصفحة التطبيق قبل الخدمة من الذاكرة (مللي ثانية) */
var NET_RACE_MS = 350;

/* ⚠️ يجب أن يطابق version + build في config.js عند كل إصدار.
   حتى لو نُسيت هذه السطر: الكود صار يُسحب من الشبكة أولاً، فلا تبقى نسخة قديمة. */
var VERSION = 'yt-news-v4.14.22';
var STATIC_CACHE = VERSION + '-static';

/* الأصول الثابتة فقط (شعارات وخطوط وصفحات) */
var STATIC_ASSETS = [
  './index.html',
  './send.html',
  './core.js',
  './ui.css',
  './assets/logo-320.png',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/apple-touch-icon.png',
  './fonts/fonts.css',
  './fonts/NotoKufiArabic-400-arabic.woff2'
];
function shellUrl(pathname) {
  if (pathname === '/' || pathname === '/index.html') return './index.html';
  if (pathname === '/send' || pathname === '/send.html') return './send.html';
  return '';
}

self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(
    caches.open(STATIC_CACHE).then(function (c) {
      return Promise.all(STATIC_ASSETS.map(function (u) {
        return c.add(new Request(u, { cache: 'reload' })).catch(function () {});
      }));
    })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== STATIC_CACHE) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
      .then(function () {
        if (self.registration.navigationPreload) return self.registration.navigationPreload.enable();
      })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // الأصول الثابتة: من الذاكرة أولاً (أسرع)
  if (/\/(assets|fonts)\//.test(url.pathname) || /\/mqtt\.min\.js$/.test(url.pathname)) {
    e.respondWith(
      caches.match(req).then(function (hit) {
        return hit || fetch(req).then(function (res) {
          var copy = res.clone();
          caches.open(STATIC_CACHE).then(function (c) { c.put(req, copy); });
          return res;
        });
      })
    );
    return;
  }

  // صفحة التطبيق: الشبكة أولاً بمهلة قصيرة، فإن بطؤت الشبكة أو انقطعت خُدِمت النسخة المحفوظة فوراً.
  // طلب التحديث (?sn= / ?swu=) يذهب للشبكة دائماً حتى لا تُعاد نسخة قديمة في حلقة.
  var isDoc = req.mode === 'navigate' || /\.html$/.test(url.pathname) || url.pathname === '/' || url.pathname === '/send';
  if (isDoc) {
    var shell = shellUrl(url.pathname);
    var bust = url.searchParams.has('sn') || url.searchParams.has('swu');
    var cached = shell
      ? caches.open(STATIC_CACHE).then(function (c) { return c.match(shell); })
      : caches.match(req);
    var net = (e.preloadResponse || Promise.resolve(null)).then(function (pre) {
      return pre || fetch(req, { cache: 'no-store' });
    }).then(function (res) {
      if (res && res.ok && shell) {
        var copy = res.clone();
        caches.open(STATIC_CACHE).then(function (c) { c.put(shell, copy); });
      }
      return res;
    });
    var fromCache = function () {
      return cached.then(function (hit) { return hit || Response.error(); });
    };
    if (bust) {
      e.respondWith(net.catch(fromCache));
      return;
    }
    e.respondWith(
      Promise.race([
        net,
        new Promise(function (r) { setTimeout(function () { r(null); }, NET_RACE_MS); })
      ]).then(function (res) {
        if (res) return res;
        net.catch(function () {});      // الشبكة تكمل في الخلفية وتحدّث الذاكرة للفتح التالي
        return fromCache();
      }).catch(function () { return fromCache(); })
    );
    return;
  }

  // config.js دائماً من الشبكة حتى يُكتشف الإصدار الجديد
  if (/config\.js$/.test(url.pathname)) {
    e.respondWith(fetch(req, { cache: 'no-store' }).catch(function () { return caches.match(req); }));
    return;
  }

  // core.js و ui.css وكل ملفات نفس الأصل: من الشبكة أولاً مع الاحتفاظ بنسخة للاستراد عند انقطاع الاتصال.
  // (كانت cache-first + immutable فبقيت النسخة القديمة أسبوعاً بعد كل تحديث)
  e.respondWith(
    fetch(req, { cache: 'no-store' }).then(function (res) {
      if (res && res.ok) {
        var copy = res.clone();
        caches.open(STATIC_CACHE).then(function (c) { c.put(req, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(req).then(function (hit) { return hit || Response.error(); });
    })
  );
});

/* ===================== Web Push ===================== */
self.addEventListener('push', function (e) {
  var data = {};
  try { data = e.data ? e.data.json() : {}; } catch (err) {
    try { data = { body: e.data ? e.data.text() : '' }; } catch (e2) { data = {}; }
  }
  var title = data.title || 'خبر عاجل — اليمن اليوم';
  var body = data.body || 'وصل خبر عاجل جديد إلى غرفة التنفيذ';
  var count = Number(data.count || 0);

  var options = {
    body: body,
    dir: 'rtl',
    lang: 'ar',
    icon: './assets/icon-192.png',
    badge: './assets/icon-192.png',
    image: undefined,
    tag: data.tag || 'yt-news',
    renotify: true,
    requireInteraction: true,       // يبقى الإشعار ظاهراً حتى يتفاعل المستخدم
    silent: false,
    vibrate: [280, 120, 280, 120, 420],
    timestamp: Date.now(),
    data: { url: data.url || './index.html', id: data.id || '' },
    actions: data.actions || [
      { action: 'open', title: 'فتح الشاشة' }
    ]
  };
  if (count > 0) options.body = body + '  (بانتظار النسخ: ' + count + ')';

  e.waitUntil(self.registration.showNotification(title, options));
});

/* رسائل من الصفحة: عرض إشعار فوري عبر الـSW (يفيد في أندرويد) */
self.addEventListener('message', function (e) {
  var d = e.data || {};
  if (d.type === 'notify') {
    self.registration.showNotification(d.title || 'خبر عاجل — اليمن اليوم', {
      body: d.body || '',
      dir: 'rtl', lang: 'ar',
      icon: './assets/icon-192.png',
      badge: './assets/icon-192.png',
      tag: d.tag || 'yt-news-live',
      renotify: true,
      requireInteraction: true,
      vibrate: [280, 120, 280],
      data: { url: d.url || './index.html' },
      actions: [{ action: 'open', title: 'فتح الشاشة' }]
    });
  }
  if (d.type === 'skipWaiting') self.skipWaiting();
});

/* الضغط على الإشعار أو أحد أزراره */
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var target = (e.notification.data && e.notification.data.url) || './index.html';
  var action = e.action;

  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if (c.url.indexOf('index.html') >= 0 || c.url.endsWith('/')) {
          if (action === 'copy' && c.postMessage) c.postMessage({ type: 'copy-first' });
          return c.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});

/* الاشتراك تغيّر (مثلاً عند إعادة تثبيت التطبيق) */
self.addEventListener('pushsubscriptionchange', function (e) {
  e.waitUntil(
    self.clients.matchAll({ type: 'window' }).then(function (list) {
      list.forEach(function (c) { c.postMessage({ type: 'resubscribe' }); });
    })
  );
});
