const normalizeName = require('./normalizeName');

// Năm dấu thanh. Dấu mũ, dấu trăng, dấu móc (â ă ơ ư) là một phần của chữ cái,
// luôn nằm đúng chỗ; chỉ dấu thanh là bị gõ ở hai vị trí: "Thủy" và "Thuỷ" là
// cùng một tên
const TONE_MARKS = /[̣̀́̃̉]/g;
const COMBINING = /[̀-ͯ]/;
const VOWEL = /[aeiouy]/;

// Đưa dấu thanh về sau nguyên âm đầu tiên của chữ. Không phải chính tả chuẩn,
// chỉ là một chỗ cố định để hai cách bỏ dấu cho ra cùng một khoá; tiền tố gõ
// dở ("Thủ") vẫn là tiền tố của tên đủ ("Thủy")
function canonicalWord(word) {
  const decomposed = word.normalize('NFD');
  const tones = decomposed.match(TONE_MARKS);
  if (!tones) return word.normalize('NFC');
  const bare = decomposed.replace(TONE_MARKS, '');
  const vowelAt = bare.search(VOWEL);
  if (vowelAt === -1) return bare.normalize('NFC');
  let insertAt = vowelAt + 1;
  while (insertAt < bare.length && COMBINING.test(bare[insertAt])) insertAt += 1;
  return `${bare.slice(0, insertAt)}${tones[0]}${bare.slice(insertAt)}`.normalize('NFC');
}

// Khoá so tên GIỮ dấu: thường hoá, gộp khoảng trắng, NFC, dấu thanh về một chỗ.
// "Thúy" và "Thủy", "Phương" và "Phượng" ra khoá khác nhau — normalizeName
// (bỏ dấu) thì coi chúng là một
function accentKey(value) {
  return String(value || '')
    .normalize('NFC')
    .trim()
    .toLocaleLowerCase('vi-VN')
    .split(/\s+/)
    .filter(Boolean)
    .map(canonicalWord)
    .join(' ');
}

// Người gõ có dùng dấu không — có thì dấu là thông tin, không được bỏ qua
function hasDiacritics(value) {
  return normalizeName(String(value || '')) !== String(value || '')
    .normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ');
}

// Hai tên cùng chữ cái có phải cùng một người không. Khớp trọn dấu thì đúng.
// Cùng chữ mà một bên không dấu thì chấp nhận (gõ "thuy", hay hồ sơ lưu
// "Phuong"): không đủ thông tin để loại. Cả hai bên có dấu mà khác dấu là hai
// người khác nhau: "Thúy" không phải "Thủy"
function sameName(storedName, typedName) {
  if (accentKey(storedName) === accentKey(typedName)) return true;
  if (normalizeName(String(storedName || '')) !== normalizeName(String(typedName || ''))) return false;
  return !hasDiacritics(storedName) || !hasDiacritics(typedName);
}

module.exports = { accentKey, hasDiacritics, sameName };
