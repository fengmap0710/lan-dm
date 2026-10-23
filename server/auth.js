// 认证：scrypt 密码哈希 + HMAC-SHA256 token
const crypto = require('crypto');
const store = require('./store');
const { getSecret } = store;

function hashPassword(password, salt) {
  const s = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, s, 32).toString('hex');
  return { salt: s, hash };
}

function verifyPassword(password, salt, hash) {
  const calc = crypto.scryptSync(password, salt, 32).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(calc, 'hex'), Buffer.from(hash, 'hex'));
}

function makeToken(userId, ttlSec) {
  const payload = { uid: userId, exp: Math.floor(Date.now() / 1000) + (ttlSec || 7 * 24 * 3600) };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', getSecret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyToken(token) {
  try {
    const [body, sig] = String(token).split('.');
    const expect = crypto.createHmac('sha256', getSecret()).update(body).digest('base64url');
    const a = Buffer.from(sig, 'base64url');
    const b = Buffer.from(expect, 'base64url');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf-8'));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

function publicUser(u) {
  return { id: u.id, username: u.username, role: u.role, createdAt: u.createdAt };
}

function requireAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const payload = token ? verifyToken(token) : null;
  if (!payload) {
    return res.status(401).json({ error: '未登录或登录已过期' });
  }
  const user = store.db.users.find((u) => u.id === String(payload.uid));
  if (!user) return res.status(401).json({ error: '用户不存在' });
  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  if (req.user && req.user.role === 'admin') return next();
  return res.status(403).json({ error: '需要管理员权限' });
}

module.exports = { hashPassword, verifyPassword, makeToken, verifyToken, publicUser, requireAuth, requireAdmin };
