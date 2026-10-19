const jwt = require('jsonwebtoken');
require('dotenv').config();

const EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

function getSecret() {
  if (!process.env.JWT_SECRET) {
    throw new Error('Missing JWT env: JWT_SECRET');
  }
  return process.env.JWT_SECRET;
}

function signToken(payload) {
  return jwt.sign(payload, getSecret(), { expiresIn: EXPIRES_IN });
}

function verifyToken(token) {
  return jwt.verify(token, getSecret());
}

// Vé mở quà: máy chủ cấp khi Face ID (hay ô gõ tên, lúc còn cho phép) mở đúng
// trang quà. Khoá riêng (không phải khoá token admin): vé không bao giờ dùng
// làm token admin được, và ngược lại
const GIFT_TICKET_TTL = '30d';
const giftSecret = () => `${getSecret()}:gift-ticket`;

function signGiftTicket(accessCode) {
  return jwt.sign({ typ: 'gift', gift: String(accessCode).toLowerCase() }, giftSecret(), { expiresIn: GIFT_TICKET_TTL });
}

function verifyGiftTicket(ticket, accessCode) {
  try {
    const payload = jwt.verify(String(ticket), giftSecret());
    return payload?.typ === 'gift' && payload.gift === String(accessCode).toLowerCase();
  } catch {
    return false;
  }
}

module.exports = { signToken, verifyToken, signGiftTicket, verifyGiftTicket };
