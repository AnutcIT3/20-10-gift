const fs = require('fs');
const path = require('path');
const normalizeName = require('../utils/normalizeName');
const { CLASS_NAME } = require('../config/constants');

// "Cất quà vào máy": gói cả trang quà thành MỘT file .html tự chứa — ảnh, font
// và logo nhúng thẳng vào file dạng data URI, không một dòng JavaScript. Trang
// quà sống nhờ một chiếc laptop; file này thì mở được mãi, không cần mạng, bằng
// trình duyệt bất kỳ (cả bản xem trước trong ứng dụng Tệp của iPhone).

const FRONTEND_PUBLIC = path.join(__dirname, '..', '..', '20-10fe', 'public');
const FONT_DIR = path.join(FRONTEND_PUBLIC, 'fonts');
const LOGO_FILE = path.join(FRONTEND_PUBLIC, 'logoclass.jpg');

// unicode-range y như src/styles/fonts.css: trình duyệt chỉ giải mã subset cần
const SUBSETS = {
  vietnamese: 'U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB',
  'latin-ext': 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF',
  latin: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD',
};
const FONT_FACES = [
  { family: 'Itim', style: 'normal', file: 'itim-400' },
  { family: 'Patrick Hand', style: 'normal', file: 'patrick-hand-400' },
  { family: 'Lora', style: 'normal', file: 'lora-400' },
  { family: 'Lora', style: 'italic', file: 'lora-400-italic' },
];

// Bản đủ nét để giữ lâu mà file vẫn nhẹ; f_jpg vì file phải mở được ở mọi nơi
// trong nhiều năm, không trông vào định dạng trình duyệt hôm nay hỗ trợ
const TRANSFORMS = {
  avatar: 'f_jpg,q_auto:good,c_fill,g_face,w_600,h_600',
  photo: 'f_jpg,q_auto:good,c_limit,w_1280',
  letter: 'f_jpg,q_auto:good,c_limit,w_1080',
};
const CLOUDINARY_ORIGIN = 'https://res.cloudinary.com/';
const UPLOAD_MARKER = '/image/upload/';

const IMAGE_TIMEOUT_MS = 15000;
const FETCH_CONCURRENCY = 4;
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
// Một bản lưu nhúng tối đa chừng này ảnh; quá thì ảnh còn lại giữ link mạng
const MAX_EMBED_BYTES = 40 * 1024 * 1024;
// Bấm tải lại (hay cả lớp cùng tải) không phải kéo ảnh từ Cloudinary lần nữa
const CACHE_MAX_BYTES = 80 * 1024 * 1024;
const CACHE_TTL_MS = 60 * 60 * 1000;
const MAX_GREETING_LENGTH = 600;
const VN_TIME_ZONE = 'Asia/Ho_Chi_Minh';

const imageCache = new Map();
let cacheBytes = 0;
let fontCssCache = null;
let logoCache;

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const STAMP_FORMAT = new Intl.DateTimeFormat('en-GB', {
  timeZone: VN_TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function vnParts(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Object.fromEntries(STAMP_FORMAT.formatToParts(date).map((part) => [part.type, part.value]));
}

// "18.10.2026 · 21:30" theo giờ Việt Nam, bất kể máy chủ đặt múi giờ nào
function formatStamp(value, { time = true } = {}) {
  const parts = vnParts(value);
  if (!parts) return '';
  const day = `${parts.day}.${parts.month}.${parts.year}`;
  return time ? `${day} · ${parts.hour}:${parts.minute}` : day;
}

// Năm của dịp 20/10 mà bản lưu thuộc về: tải từ tháng 9 trở đi là năm nay,
// tải lại vào đầu năm sau vẫn ghi đúng mùa 20/10 vừa qua
function eventYear(now) {
  const parts = vnParts(now);
  const year = Number(parts.year);
  return Number(parts.month) >= 9 ? year : year - 1;
}

function isCloudinary(url) {
  return typeof url === 'string' && url.startsWith(CLOUDINARY_ORIGIN) && url.includes(UPLOAD_MARKER);
}

// Chèn tham số biến đổi vào URL Cloudinary (giống lib/cloudinary.js phía FE)
function cloudinaryVariant(url, transform) {
  if (!isCloudinary(url)) return url;
  const at = url.indexOf(UPLOAD_MARKER);
  const rest = url.slice(at + UPLOAD_MARKER.length);
  if (!/^(v\d+\/|gift_20_10\/)/.test(rest)) return url;
  return `${url.slice(0, at + UPLOAD_MARKER.length)}${transform}/${rest}`;
}

// Ảnh không nhúng được thì giữ link mạng (vẫn hiện khi có mạng). Chỉ https:
// file lưu về máy không được kéo tài nguyên qua kết nối không mã hoá
function remoteSrc(url) {
  return typeof url === 'string' && url.startsWith('https://') ? url : null;
}

function cacheGet(url, now) {
  const hit = imageCache.get(url);
  if (!hit) return null;
  if (now - hit.at > CACHE_TTL_MS) {
    imageCache.delete(url);
    cacheBytes -= hit.bytes;
    return null;
  }
  return hit;
}

function cachePut(url, entry) {
  if (entry.bytes > CACHE_MAX_BYTES) return;
  // Map giữ thứ tự chèn: bỏ ảnh cũ nhất tới khi đủ chỗ
  for (const [key, old] of imageCache) {
    if (cacheBytes + entry.bytes <= CACHE_MAX_BYTES) break;
    imageCache.delete(key);
    cacheBytes -= old.bytes;
  }
  imageCache.set(url, entry);
  cacheBytes += entry.bytes;
}

async function fetchImage(url, fetchImpl) {
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const type = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!type.startsWith('image/')) throw new Error(`không phải ảnh (${type || 'không rõ'})`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_IMAGE_BYTES) throw new Error('ảnh quá lớn');
  return { dataUri: `data:${type};base64,${buffer.toString('base64')}`, bytes: buffer.length };
}

// Kéo các ảnh Cloudinary về và đổi thành data URI, 4 ảnh một lúc. CHỈ gọi tới
// res.cloudinary.com: máy chủ không bao giờ đi tải một địa chỉ tuỳ ý.
// Ảnh lỗi (mạng chập chờn, Cloudinary chậm) không làm hỏng cả bản lưu.
async function embedImages(urls, { fetchImpl = fetch, now = Date.now(), logger = console } = {}) {
  const unique = [...new Set(urls.filter(isCloudinary))];
  const embedded = new Map();
  let total = 0;
  let cursor = 0;

  async function worker() {
    while (cursor < unique.length) {
      const url = unique[cursor];
      cursor += 1;
      try {
        const entry = cacheGet(url, now) || await fetchImage(url, fetchImpl);
        if (total + entry.bytes > MAX_EMBED_BYTES) continue;
        total += entry.bytes;
        embedded.set(url, entry.dataUri);
        if (!imageCache.has(url)) cachePut(url, { ...entry, at: now });
      } catch (error) {
        logger?.error?.(`[keepsake] Không nhúng được ảnh ${url}: ${error.message}`);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(FETCH_CONCURRENCY, unique.length) }, worker));
  return embedded;
}

function loadFontCss() {
  if (fontCssCache !== null) return fontCssCache;
  const blocks = [];
  for (const face of FONT_FACES) {
    for (const [subset, range] of Object.entries(SUBSETS)) {
      const file = path.join(FONT_DIR, `${face.file}-${subset}.woff2`);
      if (!fs.existsSync(file)) continue;
      const data = fs.readFileSync(file).toString('base64');
      blocks.push(`@font-face{font-family:'${face.family}';font-style:${face.style};font-weight:400;`
        + `src:url(data:font/woff2;base64,${data}) format('woff2');unicode-range:${range}}`);
    }
  }
  // Thiếu thư mục font (máy chỉ có backend) thì rơi về font hệ thống
  fontCssCache = blocks.join('\n');
  return fontCssCache;
}

function loadLogo() {
  if (logoCache !== undefined) return logoCache;
  logoCache = fs.existsSync(LOGO_FILE)
    ? `data:image/jpeg;base64,${fs.readFileSync(LOGO_FILE).toString('base64')}`
    : null;
  return logoCache;
}

// Lời chúc AI chỉ trình duyệt biết (mỗi lần mở trang một câu khác) nên gửi kèm
// câu đang hiện trên màn hình; bỏ ký tự điều khiển, giới hạn độ dài
function cleanGreeting(value) {
  if (typeof value !== 'string') return null;
  const text = value.replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '').trim();
  if (!text) return null;
  return text.length > MAX_GREETING_LENGTH ? `${text.slice(0, MAX_GREETING_LENGTH).trim()}…` : text;
}

function keepsakeFilename(student) {
  const slug = normalizeName(student.nickname || student.full_name || '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `qua-20-10-${slug || 'cua-ban'}.html`;
}

const CSS = `
:root{--paper:#f7efe3;--cream:#fbf6ee;--letter:#fffdf8;--rule:#ead9c7;--beige:#e6d5bf;--beige-2:#efe3d2;--peach:#f3c9ad;--peach-soft:#fbe9db;--ink:#3d2f28;--ink-2:#5c4a40;--muted:#6b5548;--line:#c9b7a2;--clay:#a85f3f;--clay-dark:#7d4229;--moss:#6f8560;--moss-soft:#d9dfcf;--hand:'Itim',cursive;--write:'Patrick Hand',cursive;--body:'Lora',Georgia,serif}
*{box-sizing:border-box}
html{background:var(--paper)}
body{margin:0;background:var(--paper);background-image:radial-gradient(rgba(61,47,40,.045) 1px,transparent 1px);background-size:5px 5px;color:var(--ink);font:16px/1.6 var(--body);-webkit-text-size-adjust:100%}
.book{max-width:880px;margin:0 auto;padding:28px 28px 56px}
.brand{display:flex;align-items:center;justify-content:center;gap:10px;margin:0;font:17px var(--hand);color:var(--muted)}
.brand__logo{width:34px;height:34px;flex:none;border:2px solid #fff;border-radius:50%;background:var(--beige-2) center/cover no-repeat;box-shadow:0 2px 6px rgba(61,47,40,.2)}
.cover{display:grid;grid-template-columns:1.15fr .85fr;gap:30px;align-items:center;margin-top:28px}
.postmark{display:inline-grid;place-items:center;width:104px;height:104px;margin:0 0 8px 2px;border:2px solid rgba(168,95,63,.55);border-radius:50%;color:var(--clay);font:14px/1.15 var(--hand);text-align:center;letter-spacing:.06em;transform:rotate(-12deg)}
.postmark b{font-size:19px;font-weight:400}
h1{margin:0;font:400 72px/1 var(--hand);overflow-wrap:anywhere}
h1 span{color:var(--clay)}
.intro{margin:18px 0 0;font:italic 20px/1.65 var(--body);color:var(--ink-2);white-space:pre-wrap;overflow-wrap:break-word}
.polaroid{position:relative;margin:0;padding:12px 12px 14px;background:#fff;box-shadow:0 10px 26px rgba(61,47,40,.14);transform:rotate(var(--rot,0deg))}
.polaroid img{display:block;width:100%;height:auto;background:var(--beige-2)}
.polaroid figcaption{margin:10px 2px 0;font:20px/1.3 var(--write);color:var(--ink-2);text-align:center;overflow-wrap:anywhere}
.tape{position:absolute;top:-12px;left:50%;width:96px;height:24px;background:rgba(230,213,191,.85);transform:translateX(-50%) rotate(var(--tape,-3deg))}
.hero{justify-self:center;width:280px;--rot:3deg}
.hero .initial{display:grid;place-items:center;aspect-ratio:1;background:var(--peach-soft);color:var(--clay);font:96px var(--hand)}
.hero figcaption{font-size:24px}
.note{position:relative;margin:30px 0 0;padding:26px 34px;background:var(--peach-soft);clip-path:polygon(0 3%,3% 0,97% 1%,100% 4%,99% 97%,96% 100%,3% 99%,0 96%)}
.note--admin{background:var(--letter);box-shadow:0 10px 26px rgba(61,47,40,.14)}
.label{display:inline-block;padding:3px 12px;background:var(--clay);color:#fff;font:15px var(--hand);letter-spacing:.08em;transform:rotate(-2deg)}
.note--admin .label{background:var(--clay-dark)}
.note p{margin:12px 0 0;font:26px/1.5 var(--write);white-space:pre-wrap;overflow-wrap:break-word}
h2{display:flex;flex-wrap:wrap;align-items:baseline;gap:12px;margin:54px 0 6px;font:400 42px/1.1 var(--hand)}
h2 small{font:italic 15px var(--body);color:var(--muted)}
.photos{display:grid;grid-template-columns:repeat(2,1fr);gap:30px 22px;padding:24px 6px 0;align-items:start}
.photos .polaroid:nth-child(4n+1){--rot:-2deg;--tape:3deg}
.photos .polaroid:nth-child(4n+2){--rot:1.5deg;--tape:-3deg}
.photos .polaroid:nth-child(4n+3){--rot:1deg;--tape:-2deg}
.photos .polaroid:nth-child(4n){--rot:-1.5deg;--tape:2deg}
.group{display:flex;gap:12px;align-items:center;margin:30px 0 0;font:20px var(--hand);color:var(--clay)}
.group::after{content:'';flex:1;height:1px;background:var(--beige)}
.letters{display:grid;gap:26px;margin-top:22px}
.letter{position:relative;padding:28px 28px 20px;background:var(--letter);background-image:repeating-linear-gradient(transparent 0 31px,var(--rule) 31px 32px);background-position:0 12px;box-shadow:0 10px 26px rgba(61,47,40,.14);transform:rotate(var(--rot,0deg))}
.letter:nth-child(odd){--rot:-.4deg}
.letter:nth-child(even){--rot:.5deg}
.stamp{position:absolute;top:14px;right:16px;padding:5px;background:#fff;outline:2px dashed var(--beige);outline-offset:-4px;box-shadow:0 4px 12px rgba(61,47,40,.15);transform:rotate(6deg);line-height:1}
.stamp span{display:grid;place-items:center;width:44px;height:54px;background:var(--peach);font:12px/1.1 var(--hand);color:var(--clay);text-align:center}
.stamp--anon{transform:rotate(-5deg)}
.stamp--anon span{background:var(--moss-soft);color:var(--moss)}
.from{margin:0;padding-right:70px;font:26px/32px var(--write);color:var(--clay)}
.from--anon{font-style:italic;color:var(--moss)}
.subject{margin:0;padding-right:70px;font:italic 15px/32px var(--body);color:var(--muted)}
.body{margin:0 0 8px;font:22px/32px var(--write);white-space:pre-wrap;overflow-wrap:break-word}
.letter .polaroid{width:min(360px,100%);margin:10px 0 16px;--rot:-2deg}
.date{display:block;font:14px var(--hand);color:var(--muted)}
.empty{margin:18px 0 0;font:20px var(--write);color:var(--muted)}
.replies{display:grid;gap:18px;margin-top:22px}
.reply{padding:18px 24px;background:var(--cream);border-left:3px solid var(--moss);box-shadow:0 4px 12px rgba(61,47,40,.08)}
.reply__to{margin:0;font:18px var(--hand);color:var(--moss)}
.reply .body{margin:6px 0 4px;font-size:21px;line-height:1.5}
footer{display:grid;justify-items:center;gap:4px;margin-top:60px;padding-top:24px;border-top:1.5px dashed var(--line);text-align:center;color:var(--muted)}
footer .brand{margin-bottom:6px}
footer p{margin:0;font:italic 14px/1.6 var(--body)}
@media (max-width:640px){
.book{padding:22px 18px 44px}
.cover{grid-template-columns:1fr;gap:0;text-align:center}
.hero{order:-1;width:210px;margin-top:10px}
.hero .initial{font-size:72px}
.postmark{display:none}
h1{margin-top:26px;font-size:54px}
.intro{margin:12px auto 0;font-size:17px}
.note{margin:26px 0 0;padding:22px 20px}
.note p{font-size:23px}
h2{margin-top:42px;font-size:34px}
.photos{grid-template-columns:1fr 1fr;gap:22px 14px;padding:18px 2px 0}
.photos .polaroid{padding:8px 8px 10px}
.photos figcaption{font-size:16px}
.letter{padding:22px 20px 16px;background-image:repeating-linear-gradient(transparent 0 29px,var(--rule) 29px 30px);background-position:0 10px}
.from{font-size:24px;line-height:30px}
.subject{font-size:14px;line-height:30px}
.body{font-size:20px;line-height:30px}
.stamp span{width:38px;height:46px;font-size:11px}
}
@media print{
html,body{background:#fff}
.book{max-width:none;padding:0}
.letter,.polaroid,.note,.reply{break-inside:avoid;box-shadow:none}
.letter,.note,.reply{border:1px solid var(--beige)}
.polaroid{border:1px solid var(--beige-2)}
h2{break-after:avoid}
}
`;

function renderPolaroid({ src, alt, caption, className = '' }) {
  if (!src) return '';
  return `<figure class="polaroid ${className}"><span class="tape"></span>`
    + `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt || '')}">`
    + `${caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ''}</figure>`;
}

function renderLetter(letter, src) {
  const anonymous = Boolean(letter.is_anonymous) || !letter.sender_name;
  return `<article class="letter">`
    + (anonymous
      ? '<span class="stamp stamp--anon"><span>?<br>♡</span></span><p class="from from--anon">Một người bạn ẩn danh</p>'
      : `<span class="stamp"><span>20<br>10</span></span><p class="from">${escapeHtml(letter.sender_name)}</p>`)
    + (letter.title ? `<p class="subject">${escapeHtml(letter.title)}</p>` : '')
    + `<p class="body">${escapeHtml(letter.content)}</p>`
    + renderPolaroid({ src, alt: 'Ảnh kèm lời chúc' })
    + `<span class="date">${escapeHtml(formatStamp(letter.created_at))}</span>`
    + '</article>';
}

// Thư chia hai nhóm như trên trang quà; chỉ ghi tiêu đề nhóm khi có thư của
// các bạn nam — toàn thư khách thì là một danh sách liền
function renderLetters(letters, srcOf) {
  if (!letters.length) {
    return '<p class="empty">Hộp thư còn trống.</p>';
  }
  const groups = [
    { kind: 'classmate', title: `Từ các bạn nam ${CLASS_NAME}` },
    { kind: 'guest', title: 'Từ khách ghé thăm' },
  ]
    .map((group) => ({ ...group, items: letters.filter((letter) => (letter.sender_kind || 'guest') === group.kind) }))
    .filter((group) => group.items.length);
  const titled = groups.length > 1 || groups[0]?.kind === 'classmate';
  return groups.map((group) => (titled ? `<h3 class="group">${escapeHtml(group.title)}</h3>` : '')
    + `<div class="letters">${group.items.map((letter) => renderLetter(letter, srcOf(letter.image_url, 'letter'))).join('')}</div>`)
    .join('');
}

function replyRecipient(reply, lettersById) {
  if (reply.target === 'class') return `Gửi cả lớp ${CLASS_NAME}`;
  if (reply.target === 'admin') return 'Gửi admin';
  const letter = lettersById.get(Number(reply.letter_id));
  if (!letter) return 'Gửi người viết thư';
  if (letter.is_anonymous || !letter.sender_name) return 'Gửi người bạn ẩn danh';
  return `Gửi ${letter.sender_name}`;
}

/**
 * Dựng file bản lưu từ dữ liệu đã có — hàm thuần, không đụng mạng hay DB.
 * `srcOf(url, kind)` trả nguồn ảnh (data URI hoặc link dự phòng) cho từng ảnh.
 */
function renderKeepsake({
  student, gallery = [], letters = [], replies = [], greeting = null,
  srcOf = (url) => remoteSrc(url), logo = null, fontCss = '', now = new Date(),
}) {
  const displayName = student.nickname || student.full_name;
  const isFriend = student.member_type === 'friend';
  const year = eventYear(now);
  const classLabel = `Lớp ${CLASS_NAME} · 20.10.${year}`;
  const initial = (displayName || '?').trim().charAt(0).toUpperCase();
  const avatar = srcOf(student.avatar_url, 'avatar');
  const lettersById = new Map(letters.map((letter) => [Number(letter.id), letter]));
  // Logo nhúng MỘT lần trong CSS rồi dùng lại ở đầu và cuối trang
  const logoCss = logo ? `.brand__logo{background-image:url(${logo})}` : '';
  const brand = `<p class="brand">${logo ? '<span class="brand__logo"></span>' : ''}<span>${escapeHtml(classLabel)}</span></p>`;

  const heroCaption = isFriend ? `${displayName} ♡` : `${displayName} — ${CLASS_NAME} ♡`;
  const hero = avatar
    ? renderPolaroid({ src: avatar, alt: student.full_name, caption: heroCaption, className: 'hero' })
    : `<figure class="polaroid hero"><span class="tape"></span><div class="initial">${escapeHtml(initial)}</div>`
      + `<figcaption>${escapeHtml(heroCaption)}</figcaption></figure>`;

  const photos = gallery
    .map((image) => renderPolaroid({ src: srcOf(image.image_url, 'photo'), alt: image.caption || '', caption: image.caption }))
    .filter(Boolean);

  const sections = [
    `<section class="cover"><div><span class="postmark">LỚP<br>${escapeHtml(CLASS_NAME)}<br><b>20.10</b><br>${year}</span>`
      + `<h1>Gửi <span>${escapeHtml(displayName)}</span>,</h1>`
      + (student.intro_message ? `<p class="intro">${escapeHtml(student.intro_message)}</p>` : '')
      + `</div>${hero}</section>`,
  ];
  if (student.admin_wish) {
    sections.push(`<section class="note note--admin"><span class="label">💌 LỜI CHÚC TỪ ADMIN</span><p>${escapeHtml(student.admin_wish)}</p></section>`);
  }
  if (greeting) {
    sections.push(`<section class="note"><span class="label">✨ MỘT LỜI CHÚC DÀNH RIÊNG CHO BẠN</span><p>${escapeHtml(greeting)}</p></section>`);
  }
  if (photos.length) {
    sections.push(`<section><h2>Kỷ niệm <small>${photos.length} tấm ảnh</small></h2><div class="photos">${photos.join('')}</div></section>`);
  }
  sections.push(`<section><h2>Những lời chúc dành cho bạn <small>${letters.length ? `${letters.length} bức thư` : 'hộp thư còn trống'}</small></h2>`
    + `${renderLetters(letters, srcOf)}</section>`);
  if (replies.length) {
    sections.push(`<section><h2>Những dòng cậu đã hồi âm <small>${replies.length} lá</small></h2><div class="replies">`
      + replies.map((reply) => `<article class="reply"><p class="reply__to">${escapeHtml(replyRecipient(reply, lettersById))}</p>`
        + `<p class="body">${escapeHtml(reply.content)}</p><span class="date">${escapeHtml(formatStamp(reply.created_at))}</span></article>`).join('')
      + '</div></section>');
  }

  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(`Quà 20/10 của ${displayName} · Lớp ${CLASS_NAME}`)}</title>
<style>
${fontCss}
${CSS}
${logoCss}
</style>
</head>
<body>
<main class="book">
${brand}
${sections.join('\n')}
<footer>
${brand}
<p>Bản lưu tải về lúc ${escapeHtml(formatStamp(now))}. Mở bằng trình duyệt nào cũng được, không cần mạng.</p>
<p>Muốn in hay lưu PDF: mở file bằng trình duyệt, chọn In (Ctrl + P) rồi Lưu thành PDF.</p>
</footer>
</main>
</body>
</html>
`;
}

// Dựng bản lưu hoàn chỉnh: nhúng ảnh, font, logo rồi gọi renderKeepsake
async function buildKeepsake({
  student, gallery = [], letters = [], replies = [], greeting = null,
}, { fetchImpl = fetch, now = new Date(), logger = console } = {}) {
  const wanted = [
    cloudinaryVariant(student.avatar_url, TRANSFORMS.avatar),
    ...gallery.map((image) => cloudinaryVariant(image.image_url, TRANSFORMS.photo)),
    ...letters.map((letter) => cloudinaryVariant(letter.image_url, TRANSFORMS.letter)),
  ].filter(Boolean);
  const embedded = await embedImages(wanted, { fetchImpl, now: now.getTime(), logger });
  const srcOf = (url, kind) => {
    if (!url) return null;
    const variant = cloudinaryVariant(url, TRANSFORMS[kind]);
    return embedded.get(variant) || remoteSrc(variant);
  };
  const html = renderKeepsake({
    student,
    gallery,
    letters,
    replies,
    greeting: cleanGreeting(greeting),
    srcOf,
    logo: loadLogo(),
    fontCss: loadFontCss(),
    now,
  });
  return { html, filename: keepsakeFilename(student), embedded: embedded.size };
}

function clearCache() {
  imageCache.clear();
  cacheBytes = 0;
}

module.exports = {
  buildKeepsake,
  renderKeepsake,
  embedImages,
  cloudinaryVariant,
  cleanGreeting,
  keepsakeFilename,
  formatStamp,
  eventYear,
  escapeHtml,
  clearCache,
};
