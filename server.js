// server.js
require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');

const { connectDB } = require('./src/db');
const { authMiddleware } = require('./src/auth');
const authRoutes = require('./src/routes/auth');
const { router: firestoreRoutes, setNotifier } = require('./src/routes/firestore');
const { attachSocket } = require('./src/socket');

const PORT = process.env.PORT || 4000;

async function main() {
  await connectDB();

  const app = express();
  app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
  app.use(express.json({ limit: '10mb' }));
  app.use(authMiddleware);

  app.get('/health', (req, res) => res.json({ ok: true }));

  app.use('/api/auth', authRoutes);
  app.use('/api/db', firestoreRoutes);

  const server = http.createServer(app);
  const io = new Server(server, {
    cors: { origin: process.env.CORS_ORIGIN || '*' },
  });

  const { notifyChange } = attachSocket(io);
  setNotifier(notifyChange);

  server.listen(PORT, () => {
    console.log(`🚀 Sawalif backend يعمل على المنفذ ${PORT}`);
  });
}

main().catch((err) => {
  console.error('فشل تشغيل الخادم:', err);
  process.exit(1);
});
