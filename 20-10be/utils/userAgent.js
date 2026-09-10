// Loại máy + trình duyệt thô từ User-Agent cho lịch sử Face ID. Đủ để trả lời
// "camera hỏng ở đâu" — link gửi qua Zalo/Messenger mở bằng trình duyệt nhúng
// của app, nơi camera hay bị chặn — không nhằm nhận dạng từng máy.

const DEVICES = [
  ['ipad', /iPad/],
  ['iphone', /iPhone|iPod/],
  ['android', /Android.*Mobile/],
  ['android_tab', /Android/],
  ['windows', /Windows/],
  ['mac', /Macintosh|Mac OS X/],
  ['linux', /Linux|CrOS/],
];

// Thứ tự quan trọng: trình duyệt nhúng trong app trước (UA của chúng cũng chứa
// "Safari"/"Chrome"), rồi các trình duyệt dựng trên Chromium trước Chrome
const BROWSERS = [
  ['zalo', /Zalo/i],
  ['messenger', /Messenger|Orca-Android/],
  ['facebook', /FBAN|FBAV|FB_IAB|FBIOS/],
  ['instagram', /Instagram/],
  ['tiktok', /TikTok|musical_ly|BytedanceWebview/i],
  ['coccoc', /coc_coc_browser/i],
  ['samsung', /SamsungBrowser/],
  ['edge', /Edg\/|EdgA\/|EdgiOS\//],
  ['opera', /OPR\/|OPiOS\//],
  ['firefox', /Firefox\/|FxiOS\//],
  ['chrome', /Chrome\/|CriOS\//],
  ['safari', /Version\/[\d.]+.*Safari\//],
];

function pick(list, ua) {
  const found = list.find(([, pattern]) => pattern.test(ua));
  return found ? found[0] : 'other';
}

function describeUserAgent(userAgent) {
  const ua = typeof userAgent === 'string' ? userAgent : '';
  if (!ua) return { device: null, browser: null };
  return { device: pick(DEVICES, ua), browser: pick(BROWSERS, ua) };
}

module.exports = { describeUserAgent };
