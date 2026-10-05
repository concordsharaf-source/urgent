/* تشغيل دائم عبر pm2:  pm2 start ecosystem.config.js  */
module.exports = {
  apps: [{
    name: 'yt-news-push',
    script: 'server.js',
    env: {
      ROOM: '07c97da1547b2d26734f',
      VAPID_PUBLIC: 'BK0zjHV8PH3xr5tockGImilSgL6kePa_0eajU0z4wOsy7lVH4xPGMy-ZaW-9PBJQCTiGB-E1dp_AtIY3HO1FguE',
      VAPID_PRIVATE: 'dmn7UwLVF1wZvk9GUm86y1cMtFzAWQh97OUkviTngok',
      VAPID_SUBJECT: 'mailto:news@example.com'
    },
    autorestart: true,
    max_restarts: 20
  }]
};
