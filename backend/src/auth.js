const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { getDb } = require('./db');
const { HttpError } = require('./http');

function signCustomer(customer) {
  return jwt.sign(
    { sub: customer.id, email: customer.email },
    process.env.JWT_SECRET || 'shopsmart-dev-secret-change-me',
    { expiresIn: '12h' }
  );
}

function publicCustomer(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    membershipTier: row.membership_tier,
    canUploadDocuments: row.email === (process.env.DEMO_UPLOADER_EMAIL || 'premium@shopsmart.ai')
  };
}

function login(email, password) {
  const row = getDb().prepare('SELECT * FROM customers WHERE email = ?').get(String(email || '').trim().toLowerCase());
  if (!row || !bcrypt.compareSync(String(password || ''), row.password_hash)) {
    throw new HttpError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
  }
  return { token: signCustomer(row), customer: publicCustomer(row) };
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return next(new HttpError(401, 'UNAUTHORIZED', 'Sign in to continue.'));
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'shopsmart-dev-secret-change-me');
    const row = getDb().prepare('SELECT * FROM customers WHERE id = ?').get(payload.sub);
    if (!row) return next(new HttpError(401, 'UNAUTHORIZED', 'Sign in to continue.'));
    req.customer = publicCustomer(row);
    return next();
  } catch {
    return next(new HttpError(401, 'UNAUTHORIZED', 'Your session has expired. Sign in again.'));
  }
}

function requireUploader(req, res, next) {
  if (!req.customer?.canUploadDocuments) {
    return next(new HttpError(403, 'FORBIDDEN', 'Only the demo document uploader can add knowledge files.'));
  }
  return next();
}

module.exports = { login, requireAuth, requireUploader, publicCustomer };
