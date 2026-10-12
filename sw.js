/* =========================================================================
   sw.js — Service Worker لتطبيق «اليمن اليوم — غرفة الأخبار»
   المهام:
     1) تفعيل تثبيت التطبيق على الجوال والكمبيوتر (PWA).
     2) استقبال إشعارات Web Push وعرضها حتى لو كان التطبيق مغلقاً.
     3) فتح شاشة الاستقبال عند الضغط على الإشعار.
   صفحة الفتح تُحفظ على الجهاز وتُعرض فوراً حتى لا تبقى صورة الانتظار.
   config.js يبقى من الشبكة حتى يُكتشف الإصدار الجديد.
   ========================================================================= */

var VERSION = 'yt-news-v4.15.3';
var STATIC_CACHE = VERSION + '-static';

/* الأصول الثابتة فقط (شعارات وخطوط) — لا صفحات ولا سكربتات */
var STATIC_ASSETS = [
  './assets/logo-320.png',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/apple-touch-icon.png',
  './fonts/fonts.css',
  './fonts/NotoKufiArabic-400-arabic.woff2'
];

/* إزالة علامة التحويل (redirected) حتى لا ترفض متصفحات Safari/WebKit استجابة التنقل */
function cleanResponse(res) {
  if (!res) return res;
  if (res.redirected) {
    var body = (res.status === 204 || res.status === 304) ? null : res.body;
    return new Response(body, {
      status: res.status,
      statusText: res.statusText,
      headers: res.headers
    });
  }
  return res;
}

/* تخزين صفحات التطبيق مسبقاً بشكل نظيف وبدون تحويلات Vercel 308 */
function precacheDoc(c, cleanPath, filePath) {
  return fetch(new Request(cleanPath, { cache: 'reload' })).then(function (res) {
    if (res && res.ok && !res.redirected) {
      return Promise.all([
        c.put(cleanPath, res.clone()),
        c.put(filePath, res)
      ]);
    }
    var fallback = (res && res.ok) ? Promise.resolve(res) : fetch(new Request(filePath, { cache: 'reload' }));
    return fallback.then(function (r2) {
      if (!r2 || !r2.ok) return;
      var clean1 = cleanResponse(r2);
      var clean2 = cleanResponse(r2.clone ? r2.clone() : r2);
      return Promise.all([
        c.put(cleanPath, clean1),
        c.put(filePath, clean2)
      ]);
    });
  }).catch(function () {});
}

function shellUrl(pathname) {
  if (pathname === '/' || pathname === '/index.html') return './';
  if (pathname === '/send' || pathname === '/send.html') return './send';
  return '';
}

function altShellUrl(pathname) {
  if (pathname === '/' || pathname === '/index.html') return './index.html';
  if (pathname === '/send' || pathname === '/send.html') return './send.html';
  return '';
}

self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(
    caches.open(STATIC_CACHE).then(function (c) {
      var pAssets = Promise.all(STATIC_ASSETS.map(function (u) {
        return c.add(new Request(u, { cache: 'reload' })).catch(function () {});
      }));
      var pIndex = precacheDoc(c, './', './index.html');
      var pSend = precacheDoc(c, './send', './send.html');
      return Promise.all([pAssets, pIndex, pSend]);
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

  // صفحة التطبيق: من الذاكرة فوراً مهما كان رابط الفتح (?src=pwa أو ?sn=)
  // طلب التحديث (?sn= أو ?swu=) يذهب للشبكة حتى لا تُعاد نسخة قديمة في حلقة.
  var isDoc = req.mode === 'navigate' || /\.html$/.test(url.pathname) || url.pathname === '/' || url.pathname === '/send';
  if (isDoc) {
    var shell = shellUrl(url.pathname);
    var altShell = altShellUrl(url.pathname);
    var bust = url.searchParams.has('sn') || url.searchParams.has('swu');
    e.respondWith(
      caches.open(STATIC_CACHE).then(function (c) {
        var matchPrimary = shell ? c.match(shell) : Promise.resolve(null);
        return matchPrimary.then(function (hit) {
          if (hit) return hit;
          if (altShell) {
            return c.match(altShell).then(function (hit2) {
              if (hit2) return hit2;
              return c.match(req);
            });
          }
          return c.match(req);
        }).then(function (rawHit) {
          var hit = cleanResponse(rawHit);
          var net = (e.preloadResponse || Promise.resolve(null)).then(function (pre) {
            if (pre && pre.ok) return cleanResponse(pre);
            return fetch(req, { cache: 'no-store' });
          }).then(function (res) {
            if (res && res.ok && shell) {
              var toSave = cleanResponse(res.clone());
              c.put(shell, toSave);
              if (altShell) c.put(altShell, cleanResponse(res.clone()));
            }
            return cleanResponse(res);
          }).catch(function () { return hit || Response.error(); });

          if (hit && !bust) {
            net.catch(function () {});
            return hit;
          }
          return net;
        });
      })
    );
    return;
  }

  // config.js دائماً من الشبكة حتى يُكتشف الإصدار الجديد
  if (/config\.js$/.test(url.pathname)) {
    e.respondWith(fetch(req, { cache: 'no-store' }).catch(function () { return caches.match(req); }));
    return;
  }

  // core.js و ui.css: من الذاكرة أولاً (رابطهما يحمل رقم الإصدار)
  e.respondWith(
    caches.match(req).then(function (hit) {
      return hit || fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(STATIC_CACHE).then(function (c) { c.put(req, copy); });
        return res;
      });
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
    data: { url: data.url || './', id: data.id || '' },
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
      data: { url: d.url || './' },
      actions: [{ action: 'open', title: 'فتح الشاشة' }]
    });
  }
  if (d.type === 'skipWaiting') self.skipWaiting();
});

/* الضغط على الإشعار أو أحد أزراره */
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var target = (e.notification.data && e.notification.data.url) || './';
  var action = e.action;

  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if (c.url.indexOf('index.html') >= 0 || c.url.endsWith('/') || c.url.indexOf('/?') >= 0) {
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
