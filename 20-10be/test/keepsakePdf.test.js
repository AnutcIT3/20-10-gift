const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { fileURLToPath } = require('url');

process.env.DB_HOST ||= 'localhost';
process.env.DB_PORT ||= '3306';
process.env.DB_USER ||= 'test';
process.env.DB_PASSWORD ||= 'test';
process.env.DB_NAME ||= 'test';
process.env.JWT_SECRET ||= 'test-secret-for-keepsake-pdf';

const pool = require('../config/db');
const keepsakeService = require('../services/keepsakeService');
const pdfService = require('../services/pdfService');
const app = require('../server');

// Bản lưu PDF: máy chủ in chính file HTML bản lưu bằng Chrome/Edge có sẵn.
// Trình duyệt được thay bằng bản giả, trừ bài cuối in thật khi máy có Chrome.

const STUDENT = {
  id: 3,
  full_name: 'Nguyễn Thúy Vy',
  nickname: 'Vy',
  avatar_url: null,
  intro_message: 'Gửi cô bạn bàn đầu',
  member_type: 'class',
};

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

// Trình duyệt giả: ghi lại việc trang in làm, và thử gọi vài địa chỉ để xem
// bộ lọc request chặn đúng
function fakeBrowser(log, { pdfGate = null } = {}) {
  return {
    on() {},
    close: async () => { log.push('browser-close'); },
    newPage: async () => {
      const handlers = {};
      return {
        setJavaScriptEnabled: async (enabled) => { log.push(`js:${enabled}`); },
        setRequestInterception: async () => {},
        on: (event, handler) => { handlers[event] = handler; },
        goto: async (url) => {
          const file = fileURLToPath(url);
          log.push({ file, content: fs.readFileSync(file, 'utf8') });
          for (const target of [url, 'https://example.com/track.png', 'https://res.cloudinary.com/demo/a.jpg', 'file:///C:/Windows/win.ini']) {
            handlers.request({
              url: () => target,
              continue: async () => { log.push(`allow ${target}`); },
              abort: async () => { log.push(`block ${target}`); },
            });
          }
        },
        pdf: async (options) => {
          log.push({ pdf: options });
          if (pdfGate) await pdfGate;
          return new Uint8Array(Buffer.from('%PDF-1.7 fake'));
        },
        close: async () => { log.push('page-close'); },
      };
    },
  };
}

async function withFakeBrowser(t, launch) {
  const previous = process.env.PDF_BROWSER_PATH;
  // Một file chắc chắn có thật để findBrowsers không phụ thuộc máy chạy test
  process.env.PDF_BROWSER_PATH = __filename;
  pdfService.setLauncher(launch);
  t.after(async () => {
    await pdfService.shutdown();
    pdfService.setLauncher();
    if (previous === undefined) delete process.env.PDF_BROWSER_PATH;
    else process.env.PDF_BROWSER_PATH = previous;
  });
}

test('in PDF khổ A4 có nền màu, tắt JavaScript, chỉ cho đọc file bản lưu và ảnh Cloudinary, rồi xoá file tạm', async (t) => {
  const log = [];
  const launches = [];
  await withFakeBrowser(t, async (options) => {
    launches.push(options.executablePath);
    return fakeBrowser(log);
  });

  const pdf = await pdfService.htmlToPdf('<!doctype html><p>Chúc Vy vui</p>');
  assert.equal(pdf.toString(), '%PDF-1.7 fake');
  assert.deepEqual(launches, [__filename]);
  assert.ok(log.includes('js:false'));

  const opened = log.find((entry) => entry.file);
  assert.equal(opened.content, '<!doctype html><p>Chúc Vy vui</p>');
  // File tạm chứa thư riêng: in xong là xoá
  assert.equal(fs.existsSync(opened.file), false);

  assert.ok(log.some((entry) => typeof entry === 'string' && entry.startsWith('allow file:')));
  assert.ok(log.includes('allow https://res.cloudinary.com/demo/a.jpg'));
  assert.ok(log.includes('block https://example.com/track.png'));
  assert.ok(log.includes('block file:///C:/Windows/win.ini'));
  const printed = log.find((entry) => entry.pdf).pdf;
  assert.equal(printed.format, 'A4');
  assert.equal(printed.printBackground, true);
  assert.ok(log.includes('page-close'));

  // Lượt sau dùng lại trình duyệt đang mở
  await pdfService.htmlToPdf('<p>lần hai</p>');
  assert.equal(launches.length, 1);
});

test('chỉ in hai bản cùng lúc; hàng chờ đầy thì báo bận thay vì làm máy chủ ngộp', async (t) => {
  const log = [];
  const gate = deferred();
  await withFakeBrowser(t, async () => fakeBrowser(log, { pdfGate: gate.promise }));

  const total = pdfService.MAX_CONCURRENT + pdfService.MAX_WAITING;
  const jobs = Array.from({ length: total }, (_, index) => pdfService.htmlToPdf(`<p>${index}</p>`));
  await assert.rejects(() => pdfService.htmlToPdf('<p>thừa</p>'), { code: 'PDF_BUSY' });
  // Chờ cho hai bản đầu vào tới bước in
  while (log.filter((entry) => entry.pdf).length < pdfService.MAX_CONCURRENT) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.equal(log.filter((entry) => entry.pdf).length, pdfService.MAX_CONCURRENT);

  gate.resolve();
  const results = await Promise.all(jobs);
  assert.equal(results.length, total);
  assert.equal(log.filter((entry) => entry.pdf).length, total);
  // Xong hết thì lại nhận việc mới
  assert.equal((await pdfService.htmlToPdf('<p>sau</p>')).toString(), '%PDF-1.7 fake');
});

test('không có trình duyệt nào thì báo PDF_UNAVAILABLE, và thử Chrome trước Edge', async (t) => {
  const previous = process.env.PDF_BROWSER_PATH;
  process.env.PDF_BROWSER_PATH = 'C:\\khong-co\\chrome.exe';
  t.after(async () => {
    await pdfService.shutdown();
    if (previous === undefined) delete process.env.PDF_BROWSER_PATH;
    else process.env.PDF_BROWSER_PATH = previous;
  });
  await assert.rejects(() => pdfService.htmlToPdf('<p>x</p>'), { code: 'PDF_UNAVAILABLE' });

  const found = pdfService.findBrowsers({ env: {}, platform: 'win32', exists: () => true });
  assert.match(found[0], /chrome\.exe$/i);
  assert.match(found.at(-1), /msedge\.exe$/i);
  assert.deepEqual(pdfService.findBrowsers({ env: {}, platform: 'win32', exists: () => false }), []);
});

// ── API ─────────────────────────────────────────────────────────────────────

async function startApp(t) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => server.close());
  return `http://127.0.0.1:${server.address().port}`;
}

function mockDb(t) {
  const original = pool.execute;
  t.after(() => { pool.execute = original; });
  pool.execute = async (sql, params = []) => {
    if (sql.includes('FROM app_settings')) return [params[0] === 'gift_pages_locked' ? [{ setting_value: '0' }] : []];
    if (sql.includes('WHERE access_code = ?')) return [params[0] === 'vy1020' ? [STUDENT] : []];
    if (sql.includes('FROM letter_replies')) {
      return [[{ id: 2, target: 'class', content: 'Cảm ơn các cậu', status: 'approved', created_at: '2026-10-20T01:05:00.000Z' }]];
    }
    return [[]];
  };
}

const post = (base, body) => fetch(`${base}/api/gifts/vy1020/keepsake`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

test('trang quà xin PDF thì nhận file .pdf; lời cuối trang không còn bảo "mở bằng trình duyệt"', async (t) => {
  keepsakeService.clearCache();
  mockDb(t);
  const log = [];
  await withFakeBrowser(t, async () => fakeBrowser(log));
  const base = await startApp(t);

  const response = await post(base, { greeting: 'Chúc Vy vui', format: 'pdf' });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/pdf');
  assert.equal(response.headers.get('content-disposition'), 'attachment; filename="qua-20-10-vy.pdf"');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(Buffer.from(await response.arrayBuffer()).toString(), '%PDF-1.7 fake');

  const printed = log.find((entry) => entry.file).content;
  assert.match(printed, /Chúc Vy vui/);
  assert.match(printed, /Gửi các bạn nam 12A1/);
  assert.equal(printed.includes('Mở bằng trình duyệt nào cũng được'), false);
  assert.equal(printed.includes('Lưu thành PDF'), false);
});

test('máy chủ không in được PDF thì vẫn trả bản .html; hàng chờ đầy thì báo 503', async (t) => {
  keepsakeService.clearCache();
  mockDb(t);
  const logged = [];
  const warn = console.warn;
  console.warn = (...args) => logged.push(args.join(' '));
  t.after(() => { console.warn = warn; });
  await withFakeBrowser(t, async () => { throw new Error('Failed to launch the browser process'); });
  const base = await startApp(t);

  const fallback = await post(base, { format: 'pdf' });
  assert.equal(fallback.status, 200);
  assert.match(fallback.headers.get('content-type'), /text\/html/);
  assert.equal(fallback.headers.get('content-disposition'), 'attachment; filename="qua-20-10-vy.html"');
  const html = await fallback.text();
  assert.match(html, /Mở bằng trình duyệt nào cũng được/);
  assert.ok(logged.some((line) => line.includes('Không in được PDF')));

  // Không xin PDF thì vẫn là bản .html như trước
  const plain = await post(base, {});
  assert.match(plain.headers.get('content-type'), /text\/html/);

  const gate = deferred();
  pdfService.setLauncher(async () => fakeBrowser([], { pdfGate: gate.promise }));
  const busy = Array.from({ length: pdfService.MAX_CONCURRENT + pdfService.MAX_WAITING }, (_, index) => pdfService.htmlToPdf(`<p>${index}</p>`));
  const refused = await post(base, { format: 'pdf' });
  assert.equal(refused.status, 503);
  assert.equal(refused.headers.get('retry-after'), '60');
  gate.resolve();
  await Promise.all(busy);
});

test('in thật bằng Chrome trên máy này: ra PDF có font viết tay nhúng sẵn', async (t) => {
  const browsers = pdfService.findBrowsers();
  if (!browsers.length || process.env.SKIP_REAL_PDF) {
    t.skip('máy này không có Chrome/Edge');
    return;
  }
  t.after(() => pdfService.shutdown());
  const { html } = await keepsakeService.buildKeepsake(
    { student: STUDENT, letters: [], replies: [], greeting: 'Chúc Vy một ngày thật vui', format: 'pdf' },
    { fetchImpl: async () => { throw new Error('offline'); }, logger: null },
  );
  let pdf;
  try {
    pdf = await pdfService.htmlToPdf(html);
  } catch (error) {
    if (error.code === 'PDF_UNAVAILABLE') {
      t.skip(`không mở được trình duyệt: ${error.message}`);
      return;
    }
    throw error;
  }
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  const raw = pdf.toString('latin1');
  assert.match(raw, /Itim/);
  assert.match(raw, /PatrickHand/);
});

// ── Sau vòng soát lỗi ───────────────────────────────────────────────────────

test('trình duyệt cũ đóng xong không xoá nhầm trình duyệt mới; mở hỏng thì một phút sau mới thử lại', async (t) => {
  const browsers = [];
  let fail = false;
  await withFakeBrowser(t, async (options) => {
    if (fail) throw new Error('Failed to launch the browser process');
    // Tắt các handler tín hiệu của puppeteer: server.js tự tắt êm
    assert.equal(options.handleSIGINT, false);
    assert.equal(options.handleSIGTERM, false);
    const listeners = {};
    const browser = {
      ...fakeBrowser([]),
      on: (event, handler) => { listeners[event] = handler; },
      close: async () => { browser.closed = true; },
      disconnect: () => listeners.disconnected?.(),
    };
    browsers.push(browser);
    return browser;
  });

  await pdfService.htmlToPdf('<p>1</p>');
  await pdfService.shutdown();
  await pdfService.htmlToPdf('<p>2</p>');
  assert.equal(browsers.length, 2);
  // "disconnected" của trình duyệt đầu tới trễ, sau khi trình duyệt thứ hai đã mở
  browsers[0].disconnect();
  await pdfService.htmlToPdf('<p>3</p>');
  assert.equal(browsers.length, 2);

  await pdfService.shutdown();
  assert.equal(browsers[1].closed, true);

  fail = true;
  await assert.rejects(() => pdfService.htmlToPdf('<p>4</p>'), { code: 'PDF_UNAVAILABLE' });
  fail = false;
  // Vừa hỏng xong: không mở lại ngay theo cú bấm tiếp theo
  await assert.rejects(() => pdfService.htmlToPdf('<p>5</p>'), { code: 'PDF_UNAVAILABLE' });
  assert.equal(browsers.length, 2);
});
