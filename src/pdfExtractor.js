import { simpleParser } from 'mailparser';
import { promises as fs } from 'node:fs';
import path from 'node:path';

/** 判斷附件是否為 PDF（依 content-type 或副檔名）。 */
function isPdf(attachment) {
  const type = (attachment.contentType || '').toLowerCase();
  const name = (attachment.filename || '').toLowerCase();
  return type === 'application/pdf' || name.endsWith('.pdf');
}

/**
 * 第二判斷條件：PDF 附件檔名是否符合關鍵字（不分大小寫的子字串比對）。
 * pdfNameFilter 為空（null/未設定）時一律通過，不參考此條件。
 */
function matchesPdfName(attachment, pdfNameFilter) {
  if (!pdfNameFilter) return true;
  const name = (attachment.filename || '').toLowerCase();
  return name.includes(pdfNameFilter.toLowerCase());
}

/** 把字串清成可安全當檔名的形式。 */
function sanitize(text, fallback = 'unknown') {
  const cleaned = (text || '')
    .replace(/[\\/:*?"<>|\r\n]+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 100);
  return cleaned || fallback;
}

/**
 * 依使用者指定的 token 格式化信件發送時間。
 * 支援：YYYY MM DD HH mm ss（其餘字元原樣保留，例如 - _ /）。
 */
function formatDate(date, pattern) {
  const d = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const map = {
    YYYY: String(d.getFullYear()),
    MM: pad(d.getMonth() + 1),
    DD: pad(d.getDate()),
    HH: pad(d.getHours()),
    mm: pad(d.getMinutes()),
    ss: pad(d.getSeconds()),
  };
  // 由長到短比對，避免 MM 被 M 之類誤吃；目前 token 等長，仍以整詞替換
  return pattern.replace(/YYYY|MM|DD|HH|mm|ss/g, (token) => map[token]);
}

/** 取寄件者 email 的 local part 當命名用。 */
function senderTag(parsed) {
  const addr = parsed.from?.value?.[0]?.address || '';
  const local = addr.split('@')[0];
  return sanitize(local, 'sender');
}

/**
 * 依範本與各欄位組出檔名（不含副檔名）。
 * 具名佔位符：{name} {date} {from} {subject} {original} {index}
 * 日期 token 佔位符：完全由 YYYY MM DD HH mm ss 與分隔符組成的 {...}，
 *   例如 {YYYYMM}、{YYYY-MM-DD}，會以信件發送時間格式化。
 */
function buildFilename(template, fields, rawDate) {
  // 第一輪：具名佔位符（{name} 的值本身可能還含日期 token，留待第二輪處理）
  let result = template.replace(/\{(name|date|from|subject|original|index)\}/g, (_, key) =>
    fields[key] !== undefined && fields[key] !== null ? String(fields[key]) : ''
  );
  // 第二輪：日期 token 佔位符（如 {YYYYMM}）→ 以發送時間格式化
  result = result.replace(/\{([^{}]+)\}/g, (m, inner) => {
    if (/(YYYY|MM|DD|HH|mm|ss)/.test(inner) && /^[YMDHms\-_/.: ]+$/.test(inner)) {
      return formatDate(rawDate, inner);
    }
    return m; // 不認識的佔位符原樣保留
  });
  return sanitize(result, 'attachment');
}

/** 若目標檔名已存在，附加 _1, _2 ... 直到不衝突。 */
async function uniquePath(dir, filename) {
  const ext = path.extname(filename);
  const base = path.basename(filename, ext);
  let candidate = path.join(dir, filename);
  let i = 1;
  while (true) {
    try {
      await fs.access(candidate);
      candidate = path.join(dir, `${base}_${i}${ext}`);
      i += 1;
    } catch {
      return candidate;
    }
  }
}

export async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

/**
 * 解析單封信件原始內容，抽出所有 PDF 附件並依命名規則存檔。
 * @param {Buffer} source 信件原始內容
 * @param {string} downloadDir 輸出目錄
 * @param {{name:string, dateFormat:string, template:string}} naming 命名設定
 * @param {string|null} [pdfNameFilter] PDF 檔名關鍵字；留空則不篩選
 * @returns {Promise<string[]>} 已存檔的路徑陣列
 */
export async function extractPdfs(source, downloadDir, naming, pdfNameFilter = null) {
  const parsed = await simpleParser(source);
  const pdfs = (parsed.attachments || [])
    .filter(isPdf)
    .filter((att) => matchesPdfName(att, pdfNameFilter));
  if (!pdfs.length) return [];

  const date = formatDate(parsed.date, naming.dateFormat);
  const from = senderTag(parsed);
  const subject = sanitize(parsed.subject, 'no_subject');

  const saved = [];
  let index = 0;
  for (const att of pdfs) {
    index += 1;
    // 原始附件檔名（去掉 .pdf 副檔名，避免和最後補的副檔名重複）
    const rawName = sanitize(att.filename, 'attachment');
    const original = rawName.toLowerCase().endsWith('.pdf')
      ? rawName.slice(0, -4)
      : rawName;

    const baseName = buildFilename(
      naming.template,
      { name: naming.name, date, from, subject, original, index },
      parsed.date
    );
    const target = await uniquePath(downloadDir, `${baseName}.pdf`);
    await fs.writeFile(target, att.content);
    saved.push(target);
  }
  return saved;
}
