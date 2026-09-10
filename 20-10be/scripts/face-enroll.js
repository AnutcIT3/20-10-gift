#!/usr/bin/env node
/**
 * Đăng ký hồ sơ Face ID: ảnh → face-service (/embed) → một vector trung bình
 * mỗi bạn → bảng face_profiles. Không chép, không lưu ảnh; chỉ lưu vector.
 *
 *   npm run face:enroll                         quét bench/photos/<Họ và tên>/
 *   npm run face:enroll -- --dry-run            chỉ in bảng "thư mục -> học sinh"
 *   npm run face:enroll -- --photos D:\anh      thư mục ảnh khác
 *   npm run face:enroll -- --student 5 --images a.jpg b.jpg
 *
 * Cần face-service đang chạy (start-dev.bat mở sẵn) và đã chạy npm run migrate.
 */
const fs = require('fs');
const path = require('path');
const pool = require('../config/db');
const { FACE_SERVICE_URL, FACE_MODEL, FACE_MIN_FACE_PX } = require('../config/constants');
const {
  encodeEmbedding, dot, normalize, meanVector, EMBEDDING_DIM,
} = require('../services/faceService');

const ROOT = path.join(__dirname, '..', '..');
const DEFAULT_PHOTOS = path.join(ROOT, 'bench', 'photos');
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const SKIP_FOLDERS = new Set(['test']);
const SERVICE_MAX_BYTES = 8 * 1024 * 1024;   // trần upload của face-service
const EMBED_TIMEOUT_MS = 30000;              // ảnh máy ảnh lớn hơn khung camera nhiều

class UsageError extends Error {}

function parseArgs(argv) {
  const args = { dryRun: false, photos: DEFAULT_PHOTOS, student: null, images: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--photos') args.photos = argv[++i];
    else if (arg === '--student') args.student = Number(argv[++i]);
    else if (arg === '--images') {
      while (argv[i + 1] && !argv[i + 1].startsWith('--')) args.images.push(argv[++i]);
    } else if (arg === '--help' || arg === '-h') {
      throw new UsageError('');
    } else {
      throw new UsageError(`Không hiểu tham số: ${arg}`);
    }
  }
  if (args.student !== null && (!Number.isInteger(args.student) || args.student <= 0)) {
    throw new UsageError('--student cần một id học sinh (số nguyên dương)');
  }
  if (args.student !== null && !args.images.length) {
    throw new UsageError('--student cần kèm --images <ảnh 1> <ảnh 2> ...');
  }
  if (args.images.length && args.student === null) {
    throw new UsageError('--images chỉ dùng cùng --student <id>');
  }
  return args;
}

// So tên thư mục với full_name: cùng dạng Unicode (NFC), bỏ hoa/thường và
// khoảng trắng thừa — nhưng GIỮ dấu, vì "Thúy" và "Thủy" là hai người khác nhau
function nameKey(value) {
  return String(value || '').normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi');
}

function listImages(dir) {
  return fs.readdirSync(dir)
    .filter((name) => IMAGE_EXT.has(path.extname(name).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, 'vi'))
    .map((name) => path.join(dir, name));
}

async function checkService() {
  let health;
  try {
    const response = await fetch(`${FACE_SERVICE_URL}/health`, { signal: AbortSignal.timeout(5000) });
    health = response.ok ? await response.json() : null;
  } catch {
    health = null;
  }
  if (!health || health.status !== 'ok') {
    throw new Error(`Không gọi được face-service ở ${FACE_SERVICE_URL}. Mở start-dev.bat (cửa sổ "20-10 Gift Face Service") rồi chạy lại.`);
  }
  if (health.model !== FACE_MODEL) {
    throw new Error(`face-service đang chạy model "${health.model}", backend cần "${FACE_MODEL}" — vector hai model không so được với nhau.`);
  }
  return health;
}

async function embedFile(file) {
  const bytes = fs.readFileSync(file);
  if (bytes.length > SERVICE_MAX_BYTES) {
    return { error: `ảnh ${(bytes.length / 1048576).toFixed(1)} MB, quá 8 MB` };
  }
  const form = new FormData();
  form.append('image', new Blob([bytes]), path.basename(file));
  let response;
  try {
    response = await fetch(`${FACE_SERVICE_URL}/embed?max_faces=3`, {
      method: 'POST', body: form, signal: AbortSignal.timeout(EMBED_TIMEOUT_MS),
    });
  } catch (error) {
    throw new Error(`face-service ngừng trả lời khi xử lý ${path.basename(file)} (${error.message})`);
  }
  if (response.status === 400) return { error: 'không đọc được ảnh' };
  if (!response.ok) throw new Error(`face-service trả ${response.status} cho ${path.basename(file)}`);
  const payload = await response.json();
  return { faces: payload.faces || [] };
}

/**
 * Một bạn: mỗi ảnh lấy khuôn mặt to nhất; ảnh có nhiều mặt thì chọn lại mặt
 * giống "mặt tạm" của các ảnh chỉ có một người nhất (người đứng cạnh có thể to
 * hơn chủ nhân thư mục vài phần trăm — đúng lỗi benchmark từng gặp).
 * Hồ sơ = trung bình các vector đã chọn, chuẩn hóa lại (RESULTS.md: kiểu mean).
 */
async function buildProfile(files) {
  const photos = [];
  const skipped = [];
  for (const file of files) {
    const result = await embedFile(file);
    if (result.error) { skipped.push(`${path.basename(file)}: ${result.error}`); continue; }
    const faces = result.faces.filter((face) => Array.isArray(face.embedding) && face.embedding.length === EMBEDDING_DIM);
    if (!faces.length) { skipped.push(`${path.basename(file)}: không thấy mặt`); continue; }
    photos.push({ file, faces });
  }
  if (!photos.length) return { vector: null, used: 0, skipped, repicked: 0, small: [] };

  const singles = photos.filter((photo) => photo.faces.length === 1).map((photo) => photo.faces[0].embedding);
  const seed = singles.length ? singles : photos.map((photo) => photo.faces[0].embedding);
  const provisional = normalize(meanVector(seed));

  let repicked = 0;
  const small = [];
  const chosen = photos.map((photo) => {
    let best = photo.faces[0];
    if (photo.faces.length > 1) {
      best = photo.faces.reduce((top, face) => (
        dot(face.embedding, provisional) > dot(top.embedding, provisional) ? face : top
      ));
      if (best !== photo.faces[0]) repicked += 1;
    }
    if (Number(best.face_px) < FACE_MIN_FACE_PX) small.push(path.basename(photo.file));
    return best.embedding;
  });
  return { vector: normalize(meanVector(chosen)), used: chosen.length, skipped, repicked, small };
}

async function saveProfile(studentId, vector, sourceCount) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    // Đăng ký lại = thay hồ sơ gốc; hàng 'learned' (nếu sau này có) giữ nguyên
    await connection.execute(
      "DELETE FROM face_profiles WHERE student_id = ? AND model = ? AND kind = 'enroll'",
      [studentId, FACE_MODEL],
    );
    await connection.execute(
      "INSERT INTO face_profiles (student_id, model, kind, embedding, source_count) VALUES (?, ?, 'enroll', ?, ?)",
      [studentId, FACE_MODEL, encodeEmbedding(Array.from(vector)), Math.min(255, sourceCount)],
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function loadClassStudents() {
  const [rows] = await pool.execute(
    "SELECT id, full_name, is_active FROM students WHERE member_type = 'class' ORDER BY id",
  );
  return rows;
}

function planFromFolders(photosDir, students) {
  if (!fs.existsSync(photosDir)) throw new UsageError(`Không có thư mục ảnh: ${photosDir}`);
  const byName = new Map();
  for (const student of students) {
    const key = nameKey(student.full_name);
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(student);
  }
  const plan = [];
  const unmatched = [];
  const folders = fs.readdirSync(photosDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !SKIP_FOLDERS.has(entry.name.toLowerCase()))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, 'vi'));
  for (const folder of folders) {
    const files = listImages(path.join(photosDir, folder));
    const hits = byName.get(nameKey(folder)) || [];
    if (hits.length !== 1) {
      unmatched.push({ folder, files: files.length, reason: hits.length ? `trùng ${hits.length} học sinh` : 'không có học sinh tên này' });
      continue;
    }
    plan.push({ folder, student: hits[0], files });
  }
  return { plan, unmatched };
}

function pad(text, width) {
  const value = String(text);
  return value.length >= width ? value : value + ' '.repeat(width - value.length);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const students = await loadClassStudents();

  let plan;
  if (args.student !== null) {
    const student = students.find((item) => Number(item.id) === args.student);
    if (!student) throw new UsageError(`Không có thành viên lớp với id ${args.student}`);
    const files = args.images.map((file) => path.resolve(file));
    const missing = files.filter((file) => !fs.existsSync(file));
    if (missing.length) throw new UsageError(`Không thấy file: ${missing.join(', ')}`);
    plan = [{ folder: '(--images)', student, files }];
  } else {
    const mapped = planFromFolders(args.photos, students);
    plan = mapped.plan;
    console.log(`Thư mục ảnh: ${args.photos}\n`);
    console.log(`${pad('THƯ MỤC', 18)} ${pad('ẢNH', 4)} HỌC SINH`);
    for (const item of plan) {
      const inactive = item.student.is_active ? '' : '  (đang tắt trang — sẽ không được nhận diện)';
      console.log(`${pad(item.folder, 18)} ${pad(item.files.length, 4)} #${item.student.id} ${item.student.full_name}${inactive}`);
    }
    for (const item of mapped.unmatched) {
      console.log(`${pad(item.folder, 18)} ${pad(item.files, 4)} CHƯA KHỚP — ${item.reason}`);
    }
    if (mapped.unmatched.length) {
      console.log('\nĐổi tên thư mục cho đúng họ tên trong trang Học sinh rồi chạy lại để đăng ký những bạn này.');
    }
  }

  if (!plan.length) {
    console.log('\nKhông có bạn nào để đăng ký.');
    return 0;
  }
  if (args.dryRun) {
    console.log(`\n--dry-run: không ghi gì. ${plan.length} bạn sẵn sàng đăng ký.`);
    return 0;
  }

  const health = await checkService();
  console.log(`\nface-service: ${health.model_label || health.model} trên ${health.provider || '?'}\n`);

  const summary = [];
  for (const item of plan) {
    process.stdout.write(`Đang đăng ký ${item.student.full_name} (${item.files.length} ảnh)... `);
    const profile = await buildProfile(item.files);
    if (!profile.vector) {
      console.log('BỎ QUA — không có ảnh nào dùng được');
      summary.push({ ...item, used: 0, profile });
      continue;
    }
    await saveProfile(Number(item.student.id), profile.vector, profile.used);
    console.log(`xong (${profile.used} ảnh${profile.repicked ? `, chọn lại mặt ở ${profile.repicked} ảnh chụp chung` : ''})`);
    summary.push({ ...item, used: profile.used, profile });
  }

  console.log('\nKẾT QUẢ');
  console.log(`${pad('HỌC SINH', 18)} ${pad('DÙNG', 5)} ${pad('BỎ', 4)} GHI CHÚ`);
  for (const row of summary) {
    const notes = [];
    if (row.profile.repicked) notes.push(`chọn lại mặt ${row.profile.repicked} ảnh`);
    if (row.profile.small.length) notes.push(`mặt nhỏ: ${row.profile.small.join(', ')}`);
    console.log(`${pad(row.student.full_name, 18)} ${pad(row.used, 5)} ${pad(row.profile.skipped.length, 4)} ${notes.join('; ')}`);
    for (const reason of row.profile.skipped) console.log(`${' '.repeat(29)}- ${reason}`);
  }

  const [[count]] = await pool.execute(
    `SELECT COUNT(DISTINCT fp.student_id) AS students
     FROM face_profiles fp JOIN students s ON s.id = fp.student_id
     WHERE fp.model = ? AND s.is_active = TRUE AND s.member_type = 'class'`,
    [FACE_MODEL],
  );
  console.log(`\nThư viện Face ID hiện có ${count.students} bạn (model ${FACE_MODEL}).`);
  console.log('Vào admin, gạt công tắc ✨ Face ID ở thanh bên để bật thẻ trên trang chủ.');
  return summary.some((row) => row.used === 0) ? 1 : 0;
}

if (require.main === module) {
  main()
    .then((code) => { process.exitCode = code; })
    .catch((error) => {
      if (error instanceof UsageError) {
        if (error.message) console.error(`Lỗi: ${error.message}\n`);
        console.error('Cách dùng:\n  npm run face:enroll [-- --dry-run] [-- --photos <thư mục>]\n  npm run face:enroll -- --student <id> --images <ảnh> [ảnh ...]');
        process.exitCode = 2;
        return;
      }
      if (error.code === 'ER_NO_SUCH_TABLE') {
        console.error('Chưa có bảng face_profiles — chạy "npm run migrate" trong 20-10be trước.');
      } else {
        console.error(`Đăng ký thất bại: ${error.message}`);
      }
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}

module.exports = { parseArgs, nameKey, planFromFolders, buildProfile };
