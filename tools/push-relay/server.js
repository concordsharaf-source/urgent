/* =========================================================================
   push-relay/server.js — سيرفر إشعارات صغير (اختياري لكنه مُستحسن)
   وظيفته: توصيل إشعارات الأخبار العاجلة إلى الجوال/الكمبيوتر حتى لو كان
            التطبيق مغلقاً تماماً (Web Push حقيقي).

   كيف يعمل؟
     1) يستمع إلى غرفة الأخبار على نفس وسيط MQTT.
     2) يحفظ اشتراكات الأجهزة المنشورة على:  urgent/<الغرفة>/push/sub/<معرف>
     3) عند وصول رسالة على:                urgent/<الغرفة>/push/send
        يرسل إشعار Push لكل الأجهزة المسجَّلة.

   التشغيل:
     cd tools/push-relay
     npm install
     ROOM=<مفتاح-القناة> VAPID_PUBLIC=... VAPID_PRIVATE=... node server.js

   ملاحظة: ضع رابط هذا السيرفر في شاشة الإعدادات → «رابط سيرفر الإشعارات»،
   فيبدأ المتصفح بنشر طلبات الإشعارات إليه. السيرفر لا يرى نصوص الأخبار إطلاقاً
   إن أضفت له ROUTE_SEND_ONLY=1 (يقرأ push/send فقط).
   ========================================================================= */

const mqtt = require('mqtt');
const webpush = require('web-push');

const ROOM = process.env.ROOM || '';
if (!ROOM) { console.error('❌ يجب تحديد ROOM=<مفتاح القناة>'); process.exit(1); }

const VAPID_PUBLIC = process.env.VAPID_PUBLIC || '';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE || '';
if (!VAPID_PUBLIC || !VAPID_PRIVATE) { console.error('❌ يجب تحديد VAPID_PUBLIC و VAPID_PRIVATE'); process.exit(1); }
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:newsroom@example.com';

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

const BROKERS = (process.env.BROKERS ||
  'wss://broker.emqx.io:8084/mqtt,wss://broker.hivemq.com:8884/mqtt,wss://test.mosquitto.org:8081/mqtt'
).split(',');

const BASE = `urgent/${ROOM}/`;
const subs = new Map();          // id -> { sub, role, name, ts }
let client = null, brokerIdx = 0;

function connect() {
  const url = BROKERS[brokerIdx % BROKERS.length];
  console.log(`🔌 الاتصال بالوسيط: ${url}`);
  client = mqtt.connect(url, {
    clientId: 'relay_' + Math.random().toString(16).slice(2, 10),
    clean: true, keepalive: 30, reconnectPeriod: 4000, connectTimeout: 9000,
  });

  client.on('connect', () => {
    console.log('✅ تم الاتصال — جارٍ الاشتراك في غرفة الأخبار');
    client.subscribe([BASE + 'push/sub/+', BASE + 'push/send', BASE + 'presence/display'], { qos: 0 });
  });

  client.on('message', async (topic, payload) => {
    const raw = payload ? payload.toString() : '';
    if (!raw) return;
    let data; try { data = JSON.parse(raw); } catch (e) { return; }

    if (topic.indexOf(BASE + 'push/sub/') === 0) {
      const id = topic.slice((BASE + 'push/sub/').length);
      if (data.sub) { subs.set(id, data); console.log(`📱 جهاز مسجَّل (${id}) — ${subs.size} جهاز`); }
      else { subs.delete(id); console.log(`📴 إزالة جهاز (${id}) — ${subs.size} جهاز`); }
      return;
    }

    if (topic === BASE + 'push/send') {
      const title = data.title || 'خبر عاجل — اليمن اليوم';
      const body = data.body || '';
      console.log(`📤 إرسال إشعار إلى ${subs.size} جهاز: ${title}`);
      const msg = JSON.stringify({ title, body, count: data.count || 0, id: data.id || '', url: './index.html', ts: Date.now() });
      for (const [id, rec] of subs) {
        try {
          await webpush.sendNotification(rec.sub, msg, { TTL: 600, urgency: 'high' });
        } catch (err) {
          const code = err && err.statusCode;
          console.warn(`⚠️  فشل الإرسال إلى ${id}: ${code || err.message}`);
          if (code === 404 || code === 410) {           // اشتراك منتهي
            subs.delete(id);
            if (client) client.publish(BASE + 'push/sub/' + id, '', { retain: true });
          }
        }
      }
      return;
    }
  });

  client.on('error', () => { brokerIdx++; setTimeout(connect, 3000); });
  client.on('close', () => { /* mqtt يعيد المحاولة تلقائياً */ });
}

process.on('SIGINT', () => { console.log('\n👋 إيقاف السيرفر'); client && client.end(true); process.exit(0); });

connect();
console.log(`🚀 سيرفر إشعارات غرفة الأخبار يعمل — الغرفة: ${ROOM}`);
