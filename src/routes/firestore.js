// src/routes/firestore.js
// طبقة توافق عامة تحاكي Firestore (collection/doc/get/set/update/delete/query/batch)
// فوق MongoDB، تُستخدم من firestore-shim.js في الفرونت إند.

const express = require('express');
const { nanoid } = require('nanoid');
const { getDB } = require('../db');
const { runQuery } = require('../utils/query');
const { buildMongoUpdate, resolvePlainData } = require('../utils/sentinels');

const router = express.Router();

function toDocShape(raw) {
  if (!raw) return null;
  const { _id, ...data } = raw;
  return { id: _id, data };
}

// دالة يستدعيها server.js بعد كل كتابة لإشعار العملاء المشتركين (Socket.io)
let notifyChange = () => {};
function setNotifier(fn) {
  notifyChange = fn;
}

// GET /api/db/:col/doc/:id  -> getDoc
router.get('/:col/doc/:id', async (req, res) => {
  try {
    const db = getDB();
    const raw = await db.collection(req.params.col).findOne({ _id: req.params.id });
    res.json({ result: toDocShape(raw) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: { message: 'خطأ في الخادم', code: 'internal' } });
  }
});

// GET /api/db/:col/docs?q=<base64 json {wheres,orders,lim,startAfterVal}> -> getDocs
router.get('/:col/docs', async (req, res) => {
  try {
    const db = getDB();
    let spec = {};
    if (req.query.q) {
      try {
        spec = JSON.parse(Buffer.from(req.query.q, 'base64').toString('utf8'));
      } catch (e) {
        spec = {};
      }
    }
    const { filter, sort, limit } = runQuery(spec);
    let cursor = db.collection(req.params.col).find(filter);
    if (Object.keys(sort).length) cursor = cursor.sort(sort);
    if (limit && limit > 0) cursor = cursor.limit(limit);
    const raws = await cursor.toArray();
    res.json({ results: raws.map(toDocShape) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: { message: 'خطأ في الخادم', code: 'internal' } });
  }
});

// POST /api/db/:col/docs  { data }  -> addDoc (id تلقائي)
router.post('/:col/docs', async (req, res) => {
  try {
    const db = getDB();
    const id = nanoid(20);
    const data = resolvePlainData(req.body.data || {});
    await db.collection(req.params.col).insertOne({ _id: id, ...data });
    notifyChange(req.params.col, id);
    res.json({ id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: { message: 'خطأ في الخادم', code: 'internal' } });
  }
});

// PUT /api/db/:col/doc/:id  { data, merge }  -> setDoc
router.put('/:col/doc/:id', async (req, res) => {
  try {
    const db = getDB();
    const data = resolvePlainData(req.body.data || {});
    const merge = !!req.body.merge;
    if (merge) {
      await db.collection(req.params.col).updateOne(
        { _id: req.params.id },
        { $set: data },
        { upsert: true }
      );
    } else {
      await db.collection(req.params.col).replaceOne(
        { _id: req.params.id },
        { _id: req.params.id, ...data },
        { upsert: true }
      );
    }
    notifyChange(req.params.col, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: { message: 'خطأ في الخادم', code: 'internal' } });
  }
});

// PATCH /api/db/:col/doc/:id  { data }  -> updateDoc
router.patch('/:col/doc/:id', async (req, res) => {
  try {
    const db = getDB();
    const existing = await db.collection(req.params.col).findOne({ _id: req.params.id });
    if (!existing) {
      return res.status(404).json({ error: { message: 'لا يوجد مستند بهذا المعرّف', code: 'not-found' } });
    }
    const update = buildMongoUpdate(req.body.data || {});
    await db.collection(req.params.col).updateOne({ _id: req.params.id }, update);
    notifyChange(req.params.col, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: { message: 'خطأ في الخادم', code: 'internal' } });
  }
});

// DELETE /api/db/:col/doc/:id -> deleteDoc
router.delete('/:col/doc/:id', async (req, res) => {
  try {
    const db = getDB();
    await db.collection(req.params.col).deleteOne({ _id: req.params.id });
    notifyChange(req.params.col, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: { message: 'خطأ في الخادم', code: 'internal' } });
  }
});

// POST /api/db/batch  { ops: [{type, col, id, data, merge}] } -> writeBatch commit
router.post('/batch', async (req, res) => {
  try {
    const db = getDB();
    const ops = req.body.ops || [];
    const touchedCols = new Set();
    for (const op of ops) {
      const col = db.collection(op.col);
      touchedCols.add(op.col + '::' + op.id);
      if (op.type === 'set') {
        const data = resolvePlainData(op.data || {});
        if (op.merge) {
          await col.updateOne({ _id: op.id }, { $set: data }, { upsert: true });
        } else {
          await col.replaceOne({ _id: op.id }, { _id: op.id, ...data }, { upsert: true });
        }
      } else if (op.type === 'update') {
        const update = buildMongoUpdate(op.data || {});
        await col.updateOne({ _id: op.id }, update);
      } else if (op.type === 'delete') {
        await col.deleteOne({ _id: op.id });
      }
    }
    for (const key of touchedCols) {
      const [col, id] = key.split('::');
      notifyChange(col, id);
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: { message: 'خطأ في الخادم', code: 'internal' } });
  }
});

module.exports = { router, setNotifier };
