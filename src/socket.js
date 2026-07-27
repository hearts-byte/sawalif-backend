// src/socket.js
// يحاكي onSnapshot عبر Socket.io: العميل يشترك بمستند أو استعلام،
// وكل مرة يحدث فيها تغيير على المجموعة نُعيد تنفيذ نفس القراءة ونبثّها.

const { getDB } = require('./db');
const { runQuery } = require('./utils/query');
const { verifyToken } = require('./auth');

function toDocShape(raw) {
  if (!raw) return null;
  const { _id, ...data } = raw;
  return { id: _id, data };
}

function attachSocket(io) {
  // watchId -> { socketId, col, kind: 'doc'|'query', docId?, spec? }
  const watchers = new Map();

  io.on('connection', (socket) => {
    // مصادقة اختيارية عبر التوكن (لغرف خاصة بالمستخدم مستقبلاً)
    const token = socket.handshake.auth && socket.handshake.auth.token;
    if (token) {
      const decoded = verifyToken(token);
      socket.user = decoded || null;
    }

    socket.on('watch:doc', async ({ watchId, col, id }) => {
      watchers.set(watchId, { socketId: socket.id, col, kind: 'doc', docId: id });
      await sendDocSnapshot(socket, col, id, watchId);
    });

    socket.on('watch:query', async ({ watchId, col, spec }) => {
      watchers.set(watchId, { socketId: socket.id, col, kind: 'query', spec });
      await sendQuerySnapshot(socket, col, spec, watchId);
    });

    socket.on('unwatch', ({ watchId }) => {
      watchers.delete(watchId);
    });

    // بث حدث دردشة فوري اختياري (لتقليل زمن استجابة الرسائل بدل انتظار إعادة استعلام Mongo)
    socket.on('chat:typing', (payload) => {
      socket.broadcast.to(`room:${payload.roomId}`).emit('chat:typing', payload);
    });

    socket.on('room:join', (roomId) => {
      socket.join(`room:${roomId}`);
    });

    socket.on('room:leave', (roomId) => {
      socket.leave(`room:${roomId}`);
    });

    socket.on('disconnect', () => {
      for (const [wid, w] of watchers.entries()) {
        if (w.socketId === socket.id) watchers.delete(wid);
      }
    });
  });

  async function sendDocSnapshot(socket, col, id, watchId) {
    try {
      const db = getDB();
      const raw = await db.collection(col).findOne({ _id: id });
      socket.emit(`snapshot:${watchId}`, { kind: 'doc', result: toDocShape(raw) });
    } catch (err) {
      console.error('sendDocSnapshot error:', err);
    }
  }

  async function sendQuerySnapshot(socket, col, spec, watchId) {
    try {
      const db = getDB();
      const { filter, sort, limit } = runQuery(spec || {});
      let cursor = db.collection(col).find(filter);
      if (Object.keys(sort).length) cursor = cursor.sort(sort);
      if (limit && limit > 0) cursor = cursor.limit(limit);
      const raws = await cursor.toArray();
      socket.emit(`snapshot:${watchId}`, { kind: 'query', results: raws.map(toDocShape) });
    } catch (err) {
      console.error('sendQuerySnapshot error:', err);
    }
  }

  // يُستدعى من routes/firestore.js بعد أي كتابة (insert/update/delete) على مجموعة معيّنة
  function notifyChange(col, id) {
    for (const [watchId, w] of watchers.entries()) {
      if (w.col !== col) continue;
      const sock = io.sockets.sockets.get(w.socketId);
      if (!sock) continue;
      if (w.kind === 'doc') {
        if (w.docId === id) sendDocSnapshot(sock, w.col, w.docId, watchId);
      } else {
        // أي تغيير على المجموعة قد يؤثر على نتائج الاستعلام — نعيد التنفيذ ببساطة وأمان
        sendQuerySnapshot(sock, w.col, w.spec, watchId);
      }
    }
  }

  return { notifyChange };
}

module.exports = { attachSocket };
