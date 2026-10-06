// Аутентификация: регистрация по email с подтверждением, вход по паролю, JWT.
// bcryptjs — чистый JS (без нативной компиляции), jsonwebtoken — JWT.
// В проде подменяется на Keycloak/OIDC через тот же middleware (см. docs/fsp-integration.md).

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');
const emailService = require('./email');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-please-change-in-prod';
const JWT_TTL = process.env.JWT_TTL || '7d';
const VERIFICATION_CODE_TTL_MIN = 60 * 24; // 24 часа
const BCRYPT_ROUNDS = 10;

// ---- Утилиты ----

function generateVerificationCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function hashPassword(password) {
  return bcrypt.hashSync(password, BCRYPT_ROUNDS);
}

function verifyPassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

function issueJwt(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_TTL }
  );
}

function verifyJwt(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return null;
  }
}

function audit(userId, action, targetType, targetId, meta) {
  db.prepare(
    `INSERT INTO audit_log (user_id, action, target_type, target_id, meta)
     VALUES (?, ?, ?, ?, ?)`
  ).run(userId || null, action, targetType || null, targetId || null, meta ? JSON.stringify(meta) : null);
}

// ---- Регистрация ----

function register({ email, password, role, displayName }) {
  if (!email || !password || !role) {
    const err = new Error('email, password, role are required');
    err.status = 400;
    throw err;
  }
  if (!['candidate', 'employer'].includes(role)) {
    const err = new Error('role must be candidate or employer');
    err.status = 400;
    throw err;
  }
  if (password.length < 6) {
    const err = new Error('password must be at least 6 characters');
    err.status = 400;
    throw err;
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
  if (existing) {
    const err = new Error('User with this email already exists');
    err.status = 409;
    throw err;
  }

  const code = generateVerificationCode();
  const expires = new Date(Date.now() + VERIFICATION_CODE_TTL_MIN * 60 * 1000).toISOString();

  const tx = db.transaction(() => {
    const userInsert = db.prepare(
      `INSERT INTO users (email, password_hash, role, verification_code, verification_expires_at)
       VALUES (?, ?, ?, ?, ?)`
    );
    const info = userInsert.run(normalizedEmail, hashPassword(password), role, code, expires);
    const userId = info.lastInsertRowid;

    if (role === 'candidate') {
      db.prepare(
        `INSERT INTO candidates (user_id, full_name, email, stack, grade, role, consent_given, consent_at)
         VALUES (?, ?, ?, '', 'junior', 'backend', 1, datetime('now'))`
      ).run(userId, displayName || normalizedEmail, normalizedEmail);
    } else {
      db.prepare(
        `INSERT INTO employer_companies (user_id, name, contact_email)
         VALUES (?, ?, ?)`
      ).run(userId, displayName || normalizedEmail, normalizedEmail);
    }

    return userId;
  });
  const userId = tx();

  // Отправляем код (в консоль — для MVP).
  emailService.sendVerificationCode(normalizedEmail, code);

  audit(userId, 'register', 'user', userId, { role });

  return {
    user_id: userId,
    email: normalizedEmail,
    role,
    email_verified: false,
    // В MVP код возвращается на клиент для удобства демо
    // (в проде — только через e-mail).
    dev_verification_code: code,
  };
}

// ---- Подтверждение email ----

// Генерирует и сохраняет новый код. Возвращает его в ответе —
// в MVP мы не отправляем реальный e-mail, поэтому код виден пользователю на UI.
// В проде функция должна вернуть только {ok: true}, без dev_verification_code.
function resendCode(email) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const user = db.prepare('SELECT id, email_verified FROM users WHERE email = ?').get(normalizedEmail);
  if (!user) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }
  if (user.email_verified) {
    return { ok: true, already_verified: true };
  }
  const code = generateVerificationCode();
  const expires = new Date(Date.now() + VERIFICATION_CODE_TTL_MIN * 60 * 1000).toISOString();
  db.prepare(
    `UPDATE users SET verification_code = ?, verification_expires_at = ? WHERE id = ?`
  ).run(code, expires, user.id);
  emailService.sendVerificationCode(normalizedEmail, code);
  audit(user.id, 'resend_verification', 'user', user.id);
  return { ok: true, dev_verification_code: code };
}

function verifyEmail(email, code) {
  const normalizedEmail = String(email).trim().toLowerCase();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(normalizedEmail);
  if (!user) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }
  if (user.email_verified) {
    return { ok: true, already_verified: true };
  }
  if (!user.verification_code || !user.verification_expires_at) {
    const err = new Error('No verification code');
    err.status = 400;
    throw err;
  }
  if (new Date(user.verification_expires_at).getTime() < Date.now()) {
    const err = new Error('Verification code expired');
    err.status = 400;
    throw err;
  }
  if (user.verification_code !== String(code).trim()) {
    const err = new Error('Invalid verification code');
    err.status = 400;
    throw err;
  }

  db.prepare(
    `UPDATE users SET email_verified = 1, verified_at = datetime('now'),
     verification_code = NULL, verification_expires_at = NULL WHERE id = ?`
  ).run(user.id);

  audit(user.id, 'verify_email', 'user', user.id);
  return { ok: true };
}

// ---- Вход ----

function login(email, password) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(normalizedEmail);
  if (!user) {
    const err = new Error('Invalid credentials');
    err.status = 401;
    throw err;
  }
  if (!verifyPassword(password, user.password_hash)) {
    const err = new Error('Invalid credentials');
    err.status = 401;
    throw err;
  }

  // В MVP логин возможен и без подтверждения email, но помечаем флаг.
  const token = issueJwt(user);
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare(
    `INSERT INTO auth_tokens (user_id, token, expires_at) VALUES (?, ?, ?)`
  ).run(user.id, token, expires);
  db.prepare('UPDATE users SET last_login_at = datetime(\'now\') WHERE id = ?').run(user.id);

  audit(user.id, 'login', 'user', user.id);

  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      email_verified: !!user.email_verified,
    },
  };
}

// ---- Middleware ----

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Authorization required' });
  }
  const payload = verifyJwt(token);
  if (!payload) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  const user = db.prepare('SELECT id, email, role, email_verified FROM users WHERE id = ?').get(payload.sub);
  if (!user) {
    return res.status(401).json({ error: 'User not found' });
  }
  req.user = user;
  next();
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Auth required' });
    if (req.user.role !== role) {
      return res.status(403).json({ error: `Role ${role} required` });
    }
    next();
  };
}

// ---- Выход ----

function logout(token) {
  if (!token) return;
  db.prepare('UPDATE auth_tokens SET revoked = 1 WHERE token = ?').run(token);
}

// ---- Текущий пользователь ----

function me(userId) {
  const user = db.prepare('SELECT id, email, role, email_verified, created_at FROM users WHERE id = ?').get(userId);
  if (!user) return null;
  if (user.role === 'candidate') {
    const cand = db.prepare('SELECT * FROM candidates WHERE user_id = ?').get(userId);
    user.candidate = cand || null;
  } else {
    const company = db.prepare('SELECT * FROM employer_companies WHERE user_id = ?').get(userId);
    user.company = company || null;
  }
  return user;
}

module.exports = {
  register,
  verifyEmail,
  resendCode,
  login,
  logout,
  me,
  requireAuth,
  requireRole,
  hashPassword,
  verifyPassword,
  audit,
  generateToken,
};