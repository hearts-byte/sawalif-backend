# Sawalif Backend (Node.js + Express + Socket.io + MongoDB)

بديل Firebase الكامل: REST يحاكي Firestore + Socket.io للبث اللحظي (onSnapshot) + JWT بدل Firebase Auth.

## التشغيل
```bash
cp .env.example .env      # عدّل MONGO_URI و JWT_SECRET
npm install
npm run start              # أو npm run dev (nodemon)
```
يتطلب MongoDB متاحاً على MONGO_URI (محلي أو Atlas).

## نقاط النهاية
- Auth: `/api/auth/register` `/api/auth/login` `/api/auth/guest` `/api/auth/me`
  `/api/auth/update-password` `/api/auth/update-email` `/api/auth/reauthenticate`
- DB (تحاكي Firestore): `GET/POST /api/db/:col/docs`, `GET/PUT/PATCH/DELETE /api/db/:col/doc/:id`,
  `POST /api/db/batch`
- Socket.io events: `watch:doc`, `watch:query`, `unwatch`, `snapshot:<watchId>`, `room:join`, `room:leave`

## ربط الفرونت إند
غيّر ملف `js/firebase-config.js` في المشروع الأمامي ليصدّر `db`/`auth` من `firestore-shim.js` و`auth-shim.js`
بدل Firebase (تم تجهيز ذلك تلقائياً في مجلد frontend-shims المرفق). اضبط `window.__API_BASE__` و
`window.__SOCKET_BASE__` في صفحات HTML لتشير لعنوان هذا الخادم.
