// src/routes/auth.js
const express = require('express');
const { nanoid } = require('nanoid');
const { getDB } = require('../db');
const { signToken, hashPassword, comparePassword, requireAuth } = require('../auth');

const router = express.Router();
const CRED_COLLECTION = '_auth_credentials'; // مجموعة داخلية منفصلة عن users (بيانات الملف الشخصي)

// تسجيل مستخدم جديد بالبريد وكلمة المرور (بديل createUserWithEmailAndPassword)
router.post('/register', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: { message: 'email و password مطلوبان', code: 'invalid-argument' } });

    const db = getDB();
    const col = db.collection(CRED_COLLECTION);
    const existing = await col.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ error: { message: 'البريد الإلكتروني مستخدم مسبقاً', code: 'auth/email-already-in-use' } });
    }

    const uid = nanoid(28);
    const passwordHash = await hashPassword(password);
    await col.insertOne({ _id: uid, uid, email: email.toLowerCase(), passwordHash, createdAt: new Date() });

    const token = signToken({ uid, email: email.toLowerCase() });
    res.json({ user: { uid, email: email.toLowerCase() }, token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: { message: 'خطأ في الخادم', code: 'internal' } });
  }
});

// تسجيل الدخول (بديل signInWithEmailAndPassword)
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: { message: 'email و password مطلوبان', code: 'invalid-argument' } });

    const db = getDB();
    const col = db.collection(CRED_COLLECTION);
    const user = await col.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(404).json({ error: { message: 'المستخدم غير موجود', code: 'auth/user-not-found' } });

    const ok = await comparePassword(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: { message: 'كلمة المرور غير صحيحة', code: 'auth/wrong-password' } });

    const token = signToken({ uid: user.uid, email: user.email });
    res.json({ user: { uid: user.uid, email: user.email }, token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: { message: 'خطأ في الخادم', code: 'internal' } });
  }
});

// دخول ضيف/زائر (بديل signInAnonymously) — ينشئ uid بدون بريد
router.post('/guest', async (req, res) => {
  try {
    const uid = nanoid(28);
    const token = signToken({ uid, guest: true });
    res.json({ user: { uid, email: null, isAnonymous: true }, token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: { message: 'خطأ في الخادم', code: 'internal' } });
  }
});

// المستخدم الحالي (لإعادة تسجيل الدخول التلقائي عبر التوكن المخزّن)
router.get('/me', requireAuth, async (req, res) => {
  res.json({ user: { uid: req.user.uid, email: req.user.email || null, isAnonymous: !!req.user.guest } });
});

// تحديث كلمة المرور (بديل updatePassword)
router.post('/update-password', requireAuth, async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword) return res.status(400).json({ error: { message: 'newPassword مطلوبة', code: 'invalid-argument' } });
    const db = getDB();
    const col = db.collection(CRED_COLLECTION);
    const passwordHash = await hashPassword(newPassword);
    await col.updateOne({ uid: req.user.uid }, { $set: { passwordHash } });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: { message: 'خطأ في الخادم', code: 'internal' } });
  }
});

// إعادة التحقق من كلمة المرور (بديل reauthenticateWithCredential)
router.post('/reauthenticate', requireAuth, async (req, res) => {
  try {
    const { password } = req.body;
    const db = getDB();
    const col = db.collection(CRED_COLLECTION);
    const user = await col.findOne({ uid: req.user.uid });
    if (!user) return res.status(404).json({ error: { message: 'المستخدم غير موجود', code: 'auth/user-not-found' } });
    const ok = await comparePassword(password || '', user.passwordHash);
    if (!ok) return res.status(401).json({ error: { message: 'كلمة المرور غير صحيحة', code: 'auth/wrong-password' } });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: { message: 'خطأ في الخادم', code: 'internal' } });
  }
});

// تحديث البريد الإلكتروني (بديل updateEmail)
router.post('/update-email', requireAuth, async (req, res) => {
  try {
    const { newEmail } = req.body;
    if (!newEmail) return res.status(400).json({ error: { message: 'newEmail مطلوب', code: 'invalid-argument' } });
    const db = getDB();
    const col = db.collection(CRED_COLLECTION);
    const dup = await col.findOne({ email: newEmail.toLowerCase(), uid: { $ne: req.user.uid } });
    if (dup) return res.status(409).json({ error: { message: 'البريد الإلكتروني مستخدم مسبقاً', code: 'auth/email-already-in-use' } });
    await col.updateOne({ uid: req.user.uid }, { $set: { email: newEmail.toLowerCase() } });
    const token = signToken({ uid: req.user.uid, email: newEmail.toLowerCase() });
    res.json({ ok: true, token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: { message: 'خطأ في الخادم', code: 'internal' } });
  }
});

module.exports = router;
