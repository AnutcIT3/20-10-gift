const pool = require('../config/db');
const { cloudinary } = require('../config/cloudinary');

// Ảnh kèm thư nằm ở bảng letter_images (migration 025), có thứ tự. Cột
// letters.image_url / image_public_id vẫn được ghi = ảnh đầu tiên, để máy chạy
// code cũ, snapshot cũ và mọi chỗ còn đọc một ảnh vẫn hiện được ảnh đầu.

function httpError(message, statusCode) {
  return Object.assign(new Error(message), { statusCode });
}

function isMissingTable(error) {
  return error?.code === 'ER_NO_SUCH_TABLE';
}

// images: [{ url, publicId }] đúng thứ tự. executor: pool hoặc connection
// trong transaction. Máy chưa migrate 025: một ảnh thì cột cũ đã đủ; nhiều ảnh
// thì không có chỗ lưu → báo cần cập nhật thay vì lặng lẽ bỏ ảnh
async function saveLetterImages(executor, letterId, images) {
  if (!images.length) return;
  try {
    await executor.execute(
      `INSERT INTO letter_images (letter_id, image_url, public_id, position)
       VALUES ${images.map(() => '(?, ?, ?, ?)').join(', ')}`,
      images.flatMap((image, index) => [letterId, image.url, image.publicId || null, index]),
    );
  } catch (error) {
    if (!isMissingTable(error)) throw error;
    if (images.length > 1) {
      throw httpError('Máy chủ chưa hỗ trợ nhiều ảnh (cần chạy npm run migrate) — chọn một ảnh thôi nhé', 503);
    }
  }
}

// letterIds → Map(letterId → [{ id, url }]). Máy chưa migrate thì null (người
// gọi dùng cột image_url cũ)
async function imagesForLetters(letterIds) {
  if (!letterIds.length) return new Map();
  let rows;
  try {
    [rows] = await pool.execute(
      `SELECT id, letter_id, image_url FROM letter_images
       WHERE letter_id IN (${letterIds.map(() => '?').join(',')})
       ORDER BY letter_id, position, id`,
      letterIds,
    );
  } catch (error) {
    if (isMissingTable(error)) return null;
    throw error;
  }
  const byLetter = new Map();
  for (const row of rows) {
    if (!byLetter.has(row.letter_id)) byLetter.set(row.letter_id, []);
    byLetter.get(row.letter_id).push({ id: row.id, url: row.image_url });
  }
  return byLetter;
}

// Gắn images: [{ id, url }] vào từng thư; thư chưa có dòng ở bảng mới (máy
// chưa migrate, hay thư cũ) thì lấy ảnh ở cột cũ
async function withLetterImages(letters) {
  const byLetter = await imagesForLetters(letters.map((letter) => letter.id));
  return letters.map((letter) => {
    const images = byLetter?.get(letter.id) || (letter.image_url ? [{ id: null, url: letter.image_url }] : []);
    return { ...letter, images };
  });
}

// public_id của mọi ảnh thuộc các thư này (cả cột cũ lẫn bảng mới), đọc TRƯỚC
// khi xoá thư — xoá thư thì dòng ở letter_images đi theo (ON DELETE CASCADE)
async function letterPublicIds(letterIds) {
  if (!letterIds.length) return [];
  const placeholders = letterIds.map(() => '?').join(',');
  const [own] = await pool.execute(
    `SELECT image_public_id AS public_id FROM letters WHERE id IN (${placeholders}) AND image_public_id IS NOT NULL`,
    letterIds,
  );
  let extra = [];
  try {
    [extra] = await pool.execute(
      `SELECT public_id FROM letter_images WHERE letter_id IN (${placeholders}) AND public_id IS NOT NULL`,
      letterIds,
    );
  } catch (error) {
    if (!isMissingTable(error)) throw error;
  }
  return [...new Set([...own, ...extra].map((row) => row.public_id))];
}

// Một ảnh có thể nằm ở nhiều chỗ: lời chúc admin gửi nhiều người nhận dùng
// chung ảnh, và cột cũ là bản sao của ảnh đầu. Gọi SAU khi đã xoá ở DB: trả về
// những ảnh không còn chỗ nào trỏ tới — chỉ những ảnh đó mới được xoá trên Cloudinary.
const REFERENCE_QUERIES = [
  ['letters', 'image_public_id'],
  ['letter_images', 'public_id'],
  ['wish_images', 'public_id'],
  ['wish_note_images', 'public_id'],
  ['students', 'intro_image_public_id'],
  ['students', 'admin_wish_image_public_id'],
  ['students', 'greeting_image_public_id'],
];

async function unreferencedImages(publicIds) {
  const unique = [...new Set(publicIds.filter(Boolean))];
  if (!unique.length) return [];
  const placeholders = unique.map(() => '?').join(',');
  const stillUsed = new Set();
  for (const [table, column] of REFERENCE_QUERIES) {
    try {
      const [rows] = await pool.execute(
        `SELECT DISTINCT ${column} AS public_id FROM ${table} WHERE ${column} IN (${placeholders})`,
        unique,
      );
      rows.forEach((row) => stillUsed.add(row.public_id));
    } catch (error) {
      // Bảng/cột chưa có (máy chưa migrate) thì không ai dùng ảnh ở đó
      if (!isMissingTable(error) && error?.code !== 'ER_BAD_FIELD_ERROR') throw error;
    }
  }
  return unique.filter((publicId) => !stillUsed.has(publicId));
}

// Xoá DB trước, dọn Cloudinary sau (best-effort). Không kiểm tra được ảnh còn
// được dùng hay không thì để lại: mồ côi vô hại hơn một lá thư mất ảnh
async function destroyUnreferenced(publicIds) {
  let orphans;
  try {
    orphans = await unreferencedImages(publicIds);
  } catch (error) {
    console.error('Image reference check failed:', error.message);
    return;
  }
  const results = await Promise.allSettled(orphans.map((publicId) => cloudinary.uploader.destroy(publicId)));
  const failed = results.filter((result) => result.status === 'rejected').length;
  if (failed) console.error(`Cloudinary cleanup failed for ${failed} image(s)`);
}

module.exports = {
  saveLetterImages,
  imagesForLetters,
  withLetterImages,
  letterPublicIds,
  unreferencedImages,
  destroyUnreferenced,
};
