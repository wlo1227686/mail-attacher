import 'dotenv/config';
import path from 'node:path';

/**
 * 將 YYYY-MM-DD 字串轉成 Date；無效或空字串回傳 null。
 */
function parseDate(value, label) {
  if (!value || !value.trim()) return null;
  const d = new Date(`${value.trim()}T00:00:00`);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`設定 ${label} 不是有效日期（需 YYYY-MM-DD）：${value}`);
  }
  return d;
}

function bool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'y'].includes(String(value).trim().toLowerCase());
}

function str(value) {
  const v = (value ?? '').trim();
  return v.length ? v : null;
}

export function loadConfig() {
  const user = str(process.env.YAHOO_USER);
  const pass = str(process.env.YAHOO_APP_PASSWORD);

  const missing = [];
  if (!user) missing.push('YAHOO_USER');
  if (!pass) missing.push('YAHOO_APP_PASSWORD');
  if (missing.length) {
    throw new Error(
      `缺少必要設定：${missing.join(', ')}。請複製 .env.example 為 .env 並填入。`
    );
  }

  // 下載根目錄（固定，所有東西都放這底下）
  const outputRoot = str(process.env.DOWNLOAD_DIR) || './output';
  // 主資料夾：PDF 實際擺放於 outputRoot/<主資料夾>/；留空則直接放 outputRoot
  const outputFolder = str(process.env.OUTPUT_FOLDER);
  const pdfDir = outputFolder ? path.join(outputRoot, outputFolder) : outputRoot;

  // 狀態檔：放在 output 根層、檔名可自訂。
  // 若 STATE_FILE 帶有路徑分隔或為絕對路徑則原樣使用，否則置於 outputRoot 下。
  const stateName = str(process.env.STATE_FILE) || 'processed.json';
  const stateFile =
    path.isAbsolute(stateName) || stateName.includes('/') || stateName.includes(path.sep)
      ? stateName
      : path.join(outputRoot, stateName);

  return {
    imap: {
      host: 'imap.mail.yahoo.com',
      port: 993,
      secure: true,
      auth: { user, pass },
      logger: false,
    },
    filter: {
      from: str(process.env.FILTER_FROM),
      subject: str(process.env.FILTER_SUBJECT),
      since: parseDate(process.env.FILTER_SINCE, 'FILTER_SINCE'),
      before: parseDate(process.env.FILTER_BEFORE, 'FILTER_BEFORE'),
      mailbox: str(process.env.FILTER_MAILBOX) || 'INBOX',
      unseen: bool(process.env.FILTER_UNSEEN, false),
      // PDF 附件檔名關鍵字；留空則不篩選，所有 PDF 都下載
      pdfName: str(process.env.FILTER_PDF_NAME),
    },
    outputRoot,
    outputFolder,
    // PDF 實際輸出目錄（outputRoot/主資料夾）
    downloadDir: pdfDir,
    markAsSeen: bool(process.env.MARK_AS_SEEN, false),
    // 去重：記錄已下載信件的 Message-ID，下次執行時跳過
    dedupe: bool(process.env.DEDUPE, true),
    stateFile,
    naming: {
      // 自訂的固定檔名（範本中的 {name}），例：XXXXXXXXX
      name: str(process.env.FILENAME_NAME) || 'document',
      // 依信件發送時間格式化的日期字串；支援 token：YYYY MM DD HH mm ss
      dateFormat: str(process.env.FILENAME_DATE_FORMAT) || 'YYYYMMDD_HHmmss',
      // 檔名範本；支援佔位符：{name} {date} {from} {subject} {original} {index}
      template: str(process.env.FILENAME_TEMPLATE) || '{name}.{date}',
    },
  };
}
