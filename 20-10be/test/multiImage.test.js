const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DB_HOST ||= 'localhost';
process.env.DB_PORT ||= '3306';
process.env.DB_USER ||= 'test';
process.env.DB_PASSWORD ||= 'test';
process.env.DB_NAME ||= 'test';
process.env.JWT_SECRET ||= 'test-secret-for-multi-image';

const pool = require('../config/db');
const { cloudinary } = require('../config/cloudinary');
const letterImageService = require('../services/letterImageService');
const wishImageService = require('../services/wishImageService');
const keepsakeService = require('../services/keepsakeService');
const { extractLetterImages, assertImageCount } = require('../utils/letterUpload');

// Một lời chúc (thư của khách, thư admin, hay một trong ba lời chúc riêng)
// kèm tối đa 4 ảnh.

const photo = (n) => ({ url: `https://res.cloudinary.com/demo/image/upload/v1/gift_20_10/${n}.jpg`, publicId: `gift_20_10/${n}` });
const missingTable = () => Object.assign(new Error('missing'), { code: 'ER_NO_SUCH_TABLE' });

test('nhận cả trường "image" (bản cũ) lẫn "images", đúng thứ tự chọn', () => {
  const file = (n) => ({ path: photo(n).url, filename: photo(n).publicId });
  assert.deepEqual(extractLetterImages({ files: { image: [file(1)], images: [file(2), file(3)] } }), [photo(1), photo(2), photo(3)]);
  assert.deepEqual(extractLetterImages({ file: file(9) }), [photo(9)]);
  assert.deepEqual(extractLetterImages({}), []);
});

test('quá 4 ảnh thì dọn hết ảnh vừa upload và báo 400, không giữ lặng lẽ 4 ảnh đầu', async (t) => {
  const destroyed = [];
  const original = cloudinary.uploader.destroy;
  cloudinary.uploader.destroy = async (publicId) => { destroyed.push(publicId); };
  t.after(() => { cloudinary.uploader.destroy = original; });

  await assertImageCount([1, 2, 3, 4].map(photo));
  assert.deepEqual(destroyed, []);
  await assert.rejects(() => assertImageCount([1, 2, 3, 4, 5].map(photo)), { statusCode: 400, message: /tối đa 4 ảnh/ });
  assert.deepEqual(destroyed, [1, 2, 3, 4, 5].map((n) => `gift_20_10/${n}`));
});

test('máy chưa migrate 025: một ảnh vẫn gửi được (cột cũ), nhiều ảnh báo cần cập nhật', async () => {
  const executor = { execute: async () => { throw missingTable(); } };
  await letterImageService.saveLetterImages(executor, 1, [photo(1)]);
  await assert.rejects(() => letterImageService.saveLetterImages(executor, 1, [photo(1), photo(2)]), { statusCode: 503 });
});

test('máy chưa migrate 025: thư và lời chúc riêng đọc ảnh ở cột cũ, trang quà không hỏng', async (t) => {
  const original = pool.execute;
  const originalGetConnection = pool.getConnection;
  pool.execute = async () => { throw missingTable(); };
  pool.getConnection = async () => ({
    beginTransaction: async () => {},
    execute: async (sql) => (sql.includes('FROM students') ? [[{ id: 3 }]] : Promise.reject(missingTable())),
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
  });
  t.after(() => {
    pool.execute = original;
    pool.getConnection = originalGetConnection;
  });

  const [letter, plain] = await letterImageService.withLetterImages([{ id: 1, image_url: 'a.jpg' }, { id: 2, image_url: null }]);
  assert.deepEqual(letter.images, [{ id: null, url: 'a.jpg' }]);
  assert.deepEqual(plain.images, []);

  const [student] = await wishImageService.withWishImages([{ id: 3, admin_wish_image_url: 'w.jpg' }]);
  assert.deepEqual(student.admin_wish_images, [{ id: null, url: 'w.jpg' }]);
  assert.deepEqual(student.intro_images, []);
  assert.deepEqual(student.greeting_images, []);

  await assert.rejects(() => wishImageService.addWishImages(3, 'greeting', [photo(1)]), { statusCode: 503 });
});

test('bản lưu kỷ niệm có đủ mọi ảnh của một lời chúc', () => {
  const html = keepsakeService.renderKeepsake({
    student: {
      id: 3,
      full_name: 'Nguyễn Thúy Vy',
      member_type: 'class',
      intro_message: 'Gửi cô bạn bàn đầu',
      intro_images: [{ id: 1, url: 'https://x/intro-1.jpg' }],
      admin_wish: 'Chúc Vy',
      admin_wish_images: [{ id: 2, url: 'https://x/wish-1.jpg' }, { id: 3, url: 'https://x/wish-2.jpg' }],
    },
    letters: [{
      id: 9, sender_name: 'An', content: 'Chúc mừng', created_at: new Date('2026-10-20T01:00:00Z'),
      image_url: 'https://x/l-1.jpg',
      images: [1, 2, 3].map((n) => ({ id: n, url: `https://x/l-${n}.jpg` })),
    }],
    srcOf: (url) => url,
  });
  for (const name of ['intro-1', 'wish-1', 'wish-2', 'l-1', 'l-2', 'l-3']) {
    assert.ok(html.includes(`https://x/${name}.jpg`), `thiếu ảnh ${name}`);
  }
  // Nhiều ảnh xếp lưới; một ảnh giữ khổ lớn như cũ
  assert.equal((html.match(/<div class="pics">/g) || []).length, 2);
});
