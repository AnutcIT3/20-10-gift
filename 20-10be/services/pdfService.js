const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

// In bản lưu thành PDF bằng chính Chrome/Edge đã cài trên máy chạy trang:
// puppeteer-core không tải thêm Chromium nào. Không trình duyệt nào chạy được
// thì báo PDF_UNAVAILABLE để controller trả bản HTML thay thế.

// Chrome đứng trước: trên laptop chạy trang, Edge ở chế độ headless thoát ngay
// mà không báo lỗi gì, nên Edge chỉ là phương án cuối
const BROWSER_CANDIDATES = {
  win32: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ],
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ],
  linux: [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/microsoft-edge',
  ],
};

// Hai bản in cùng lúc là đủ cho một laptop; thêm tối đa 20 bạn xếp hàng, quá
// nữa thì báo bận thay vì để máy chủ ngộp lúc cả lớp bấm tải một lượt
const MAX_CONCURRENT = 2;
const MAX_WAITING = 20;
// Mỗi bước (mở trang, in) tối đa 30 giây: kẹt thì vẫn còn thời gian trả bản
// .html trước khi trang quà bỏ cuộc ở giây thứ 90
const RENDER_TIMEOUT_MS = 30_000;
const IDLE_CLOSE_MS = 5 * 60_000;
// Không mở được trình duyệt thì một phút sau mới thử lại: mỗi lần Edge mở hỏng
// có thể để lại một Edge chạy ngầm, không nên lặp lại theo từng cú bấm
const UNAVAILABLE_RETRY_MS = 60_000;
const PAGE_MARGIN = { top: '14mm', bottom: '14mm', left: '12mm', right: '12mm' };

let browserPromise = null;
let unavailable = null;
let idleTimer = null;
let active = 0;
const waiting = [];

function pdfError(code, message) {
  return Object.assign(new Error(message), { code });
}

// Các trình duyệt có trên máy theo thứ tự thử; đặt PDF_BROWSER_PATH thì chỉ
// dùng đúng trình duyệt đó
function findBrowsers({ env = process.env, platform = process.platform, exists = fs.existsSync } = {}) {
  if (env.PDF_BROWSER_PATH) return exists(env.PDF_BROWSER_PATH) ? [env.PDF_BROWSER_PATH] : [];
  return (BROWSER_CANDIDATES[platform] || []).filter((candidate) => candidate && exists(candidate));
}

function loadPuppeteer() {
  try {
    return require('puppeteer-core');
  } catch {
    throw pdfError('PDF_UNAVAILABLE', 'Chưa cài puppeteer-core (chạy npm install trong 20-10be)');
  }
}

const defaultLaunch = (options) => loadPuppeteer().launch(options);
let launch = defaultLaunch;

async function launchBrowser() {
  const candidates = findBrowsers();
  if (!candidates.length) throw pdfError('PDF_UNAVAILABLE', 'Máy chủ không có Chrome hay Edge để in PDF');
  const failures = [];
  for (const executablePath of candidates) {
    try {
      return await launch({
        executablePath,
        headless: true,
        // server.js tự tắt êm khi Ctrl+C; puppeteer không được tự process.exit
        handleSIGINT: false,
        handleSIGTERM: false,
        handleSIGHUP: false,
        args: ['--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-gpu', '--mute-audio'],
      });
    } catch (error) {
      if (error.code === 'PDF_UNAVAILABLE') throw error;
      failures.push(`${path.basename(executablePath)}: ${String(error.message).split('\n')[0]}`);
    }
  }
  throw pdfError('PDF_UNAVAILABLE', `Không mở được trình duyệt để in PDF (${failures.join('; ')})`);
}

function getBrowser() {
  if (unavailable && Date.now() - unavailable.at < UNAVAILABLE_RETRY_MS) {
    return Promise.reject(unavailable.error);
  }
  if (!browserPromise) {
    const pending = launchBrowser().then((browser) => {
      // Chỉ quên đúng trình duyệt này: lúc đóng vì ngồi không, một trình duyệt
      // mới có thể đã được mở và không được bị xoá nhầm khỏi browserPromise
      browser.on('disconnected', () => {
        if (browserPromise === pending) browserPromise = null;
      });
      unavailable = null;
      return browser;
    }, (error) => {
      if (browserPromise === pending) browserPromise = null;
      if (error.code === 'PDF_UNAVAILABLE') unavailable = { at: Date.now(), error };
      throw error;
    });
    browserPromise = pending;
  }
  return browserPromise;
}

// Trình duyệt ngồi không 5 phút thì đóng cho nhẹ máy; lượt tải sau mở lại
function scheduleIdleClose() {
  clearTimeout(idleTimer);
  if (active > 0 || waiting.length > 0) return;
  idleTimer = setTimeout(() => { shutdown().catch(() => {}); }, IDLE_CLOSE_MS);
  idleTimer.unref?.();
}

function acquire() {
  clearTimeout(idleTimer);
  if (active < MAX_CONCURRENT) {
    active += 1;
    return Promise.resolve();
  }
  if (waiting.length >= MAX_WAITING) {
    return Promise.reject(pdfError('PDF_BUSY', 'Nhiều bạn đang tải bản lưu quá'));
  }
  return new Promise((resolve) => waiting.push(resolve));
}

function release() {
  const next = waiting.shift();
  if (next) next();
  else active -= 1;
  scheduleIdleClose();
}

// Trang in chỉ được đọc chính file bản lưu và ảnh Cloudinary dự phòng (ảnh
// nhúng hỏng thì bản lưu giữ link gốc); mọi địa chỉ khác bị chặn
function allowRequest(url, fileUrl) {
  return url === fileUrl || url.startsWith('data:') || url.startsWith('https://res.cloudinary.com/');
}

/**
 * Dựng PDF khổ A4 từ HTML bản lưu. HTML được ghi ra file tạm rồi mở bằng
 * file:// — bản lưu nhúng ảnh base64 có thể tới vài chục MB, quá lớn để đẩy
 * qua kênh DevTools. File tạm bị xoá ngay khi in xong.
 */
async function htmlToPdf(html, { timeoutMs = RENDER_TIMEOUT_MS } = {}) {
  await acquire();
  let dir = null;
  let page = null;
  try {
    const browser = await getBrowser();
    dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'gift-keepsake-'));
    const file = path.join(dir, 'ban-luu.html');
    await fs.promises.writeFile(file, html, { encoding: 'utf8', mode: 0o600 });
    const fileUrl = pathToFileURL(file).href;

    page = await browser.newPage();
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      if (allowRequest(request.url(), fileUrl)) request.continue().catch(() => {});
      else request.abort().catch(() => {});
    });
    await page.goto(fileUrl, { waitUntil: 'load', timeout: timeoutMs });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: PAGE_MARGIN,
      timeout: timeoutMs,
    });
    return Buffer.from(pdf);
  } finally {
    if (page) await page.close().catch(() => {});
    if (dir) await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
    release();
  }
}

async function shutdown() {
  clearTimeout(idleTimer);
  unavailable = null;
  const pending = browserPromise;
  browserPromise = null;
  if (!pending) return;
  const browser = await pending.catch(() => null);
  if (browser) await browser.close().catch(() => {});
}

// Cho test thay puppeteer bằng trình duyệt giả; gọi không tham số để trả lại
function setLauncher(fn) {
  launch = fn || defaultLaunch;
  unavailable = null;
}

module.exports = {
  htmlToPdf,
  findBrowsers,
  setLauncher,
  shutdown,
  allowRequest,
  MAX_CONCURRENT,
  MAX_WAITING,
};
