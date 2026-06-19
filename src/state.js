import { promises as fs } from 'node:fs';

/**
 * 載入已處理清單（依 Message-ID 去重用）。
 * 檔案不存在或內容損壞時，一律視為空集合，不讓程式中斷。
 * @returns {Promise<Set<string>>}
 */
export async function loadState(file) {
  try {
    const txt = await fs.readFile(file, 'utf8');
    const data = JSON.parse(txt);
    const ids = Array.isArray(data)
      ? data
      : Array.isArray(data?.processed)
        ? data.processed
        : [];
    return new Set(ids);
  } catch {
    return new Set();
  }
}

/** 把已處理的 Message-ID 集合寫回狀態檔。 */
export async function saveState(file, set) {
  const payload = {
    updatedAt: new Date().toISOString(),
    processed: [...set],
  };
  await fs.writeFile(file, JSON.stringify(payload, null, 2));
}
