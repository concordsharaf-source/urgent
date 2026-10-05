# سيرفر إشعارات الأخبار (Push Relay)

يجعل الإشعارات تصل إلى جوال المنفذ **حتى لو كان التطبيق مغلقاً تماماً**.

## لماذا أحتاجه؟
المتصفح يستطيع إظهار إشعارات النظام عندما يكون الموقع مفتوحاً (أو في الخلفية القريبة).
أما الإشعارات والتطبيق مغلق كلياً فتحتاج سيرفر Web Push صغير — وهو هذا.

## التشغيل على أي جهاز/سيرفر (Node.js 18+)

```bash
cd tools/push-relay
npm install
ROOM=<مفتاح-القناة> \
VAPID_PUBLIC=BK0zjHV8PH3xr5tockGImilSgL6kePa_0eajU0z4wOsy7lVH4xPGMy-ZaW-9PBJQCTiGB-E1dp_AtIY3HO1FguE \
VAPID_PRIVATE=dmn7UwLVF1wZvk9GUm86y1cMtFzAWQh97OUkviTngok \
VAPID_SUBJECT=mailto:news@example.com \
node server.js
```

أو انسخ `.env.example` إلى `.env` وعدّل القيم، ثم:

```bash
node -r dotenv/config server.js     # أو npm i dotenv أولاً
```

## تشغيل دائم
- استضافة مجانية/رخيصة لأي سيرفر Node (Render, Railway, Fly.io, VPS…).
- أو محلياً: `pm2 start ecosystem.config.js` على جهاز يعمل دائماً.

## الخطوة الأخيرة في التطبيق
افتح **شاشة الاستقبال ← الإعدادات ← رابط سيرفر الإشعارات** واكتب رابط السيرفر
(مثال: `https://push.example.com`)، ثم اضغط **تفعيل الإشعارات والتطبيق مغلق**.

## الأمان
- السيرفر يستمع لغرفة الأخبار فقط (`urgent/<ROOM>/…`) ولا يحتفظ بأي محتوى.
- المفتاح الخاص (VAPID_PRIVATE) يبقى هنا فقط — لا تضعه في المستودع العام.
- لا يرسل السيرفر نصوص الأخبار إلى أي طرف ثالث؛ فقط إلى خدمة الإشعارات الرسمية للمتصفح.
