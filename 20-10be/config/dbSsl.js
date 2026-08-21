const fs = require('fs');
const path = require('path');

/**
 * MySQL managed trên cloud (Aiven, TiDB, Azure...) bắt buộc TLS, trong khi
 * MySQL cài local thì không. Bật bằng DB_SSL=true trong .env.
 *
 * - Có DB_SSL_CA (đường dẫn tới ca.pem tải từ console nhà cung cấp):
 *   mã hóa + xác thực đầy đủ chứng chỉ máy chủ — nên dùng.
 * - Không có: vẫn mã hóa đường truyền nhưng bỏ qua bước xác thực chứng chỉ.
 *   Chấp nhận được cho dự án lớp học, nhưng kém an toàn hơn.
 */
function buildSslOption(env = process.env) {
  if (String(env.DB_SSL || '').toLowerCase() !== 'true') return undefined;

  const caPath = env.DB_SSL_CA;
  if (caPath) {
    const resolved = path.isAbsolute(caPath)
      ? caPath
      : path.join(__dirname, '..', caPath);
    return { ca: fs.readFileSync(resolved, 'utf8'), rejectUnauthorized: true };
  }

  return { rejectUnauthorized: false };
}

module.exports = buildSslOption;
