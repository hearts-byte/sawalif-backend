// src/auth.js
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret_in_production';

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return null;
  }
}

async function hashPassword(pw) {
  return bcrypt.hash(pw, 10);
}

async function comparePassword(pw, hash) {
  return bcrypt.compare(pw, hash);
}

// Express middleware: يقرأ التوكن من Authorization header (Bearer) ويضع req.user
function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    req.user = null;
    return next();
  }
  const decoded = verifyToken(token);
  req.user = decoded || null;
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'unauthorized' });
  next();
}

module.exports = {
  signToken,
  verifyToken,
  hashPassword,
  comparePassword,
  authMiddleware,
  requireAuth,
};
