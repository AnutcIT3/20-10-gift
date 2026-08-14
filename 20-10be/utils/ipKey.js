const net = require('net');

// Chuẩn hóa IP làm khóa rate limit. Client IPv6 thường được cấp nguyên dải /64
// nên nếu khóa theo địa chỉ đầy đủ, chỉ cần xoay địa chỉ trong dải là né được
// limiter — gộp về prefix /64 để cả dải chia chung một hạn mức.
function ipKey(ip) {
  const raw = (ip || '').split('%')[0];
  if (net.isIP(raw) !== 6) return raw;

  // IPv4-mapped (::ffff:1.2.3.4) → dùng phần IPv4
  const v4 = raw.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (v4) return v4[1];

  // Bung "::" rồi lấy 4 hextet đầu (= /64)
  const [headPart, tailPart] = raw.split('::');
  const head = headPart ? headPart.split(':') : [];
  const tail = tailPart ? tailPart.split(':') : [];
  const missing = 8 - head.length - tail.length;
  const full = [...head, ...Array(missing).fill('0'), ...tail];
  return `${full.slice(0, 4).join(':')}::/64`;
}

module.exports = ipKey;
