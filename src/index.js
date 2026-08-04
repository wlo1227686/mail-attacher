import { loadConfig } from './config.js';
import { MailClient } from './mailClient.js';
import { ensureDir, extractPdfs } from './pdfExtractor.js';
import { loadState, saveState } from './state.js';

/** 把目前套用的篩選條件印出來，方便確認。 */
function describeFilter(filter) {
  const parts = [];
  if (filter.from) parts.push(`寄件者=${filter.from}`);
  if (filter.subject) parts.push(`主旨含「${filter.subject}」`);
  if (filter.since) parts.push(`自 ${filter.since.toISOString().slice(0, 10)}`);
  if (filter.before) parts.push(`至 ${filter.before.toISOString().slice(0, 10)}（不含）`);
  if (filter.unseen) parts.push('僅未讀');
  if (filter.pdfName) parts.push(`PDF檔名含「${filter.pdfName}」`);
  return parts.length ? parts.join('、') : '（無條件，全部信件）';
}

async function main() {
  const config = loadConfig();
  await ensureDir(config.downloadDir);

  console.log(`Mail 服務：${config.provider}（${config.imap.host}）`);
  console.log(`信件夾：${config.filter.mailbox}`);
  console.log(`篩選：${describeFilter(config.filter)}`);
  console.log(`輸出目錄：${config.downloadDir}`);
  if (config.dedupe) console.log(`去重狀態檔：${config.stateFile}`);

  const mail = new MailClient(config.imap);
  await mail.connect();

  const processedUids = [];
  let totalPdfs = 0;
  const seen = config.dedupe ? await loadState(config.stateFile) : new Set();
  let stateChanged = false;
  try {
    const uids = await mail.search(config.filter);
    console.log(`符合條件的信件：${uids.length} 封`);
    if (!uids.length) return;

    // 下載前先用 Message-ID 去重，跳過先前已下載過的信
    const envelopes = await mail.fetchEnvelopes(uids);
    const midByUid = new Map(envelopes.map((e) => [e.uid, e.messageId]));
    const pending = config.dedupe
      ? envelopes.filter((e) => !(e.messageId && seen.has(e.messageId)))
      : envelopes;
    const skipped = envelopes.length - pending.length;
    if (config.dedupe && skipped) {
      console.log(`跳過先前已下載：${skipped} 封`);
    }
    if (!pending.length) {
      console.log('沒有新的信件需要下載。');
      return;
    }

    await mail.fetchSources(
      pending.map((e) => e.uid),
      async (uid, source) => {
        const saved = await extractPdfs(
          source,
          config.downloadDir,
          config.naming,
          config.filter.pdfName
        );
        if (saved.length) {
          processedUids.push(uid);
          totalPdfs += saved.length;
          for (const file of saved) console.log(`  ✓ 下載：${file}`);
          // 成功下載才記錄，避免日後放寬條件時誤跳過
          const mid = midByUid.get(uid);
          if (config.dedupe && mid) {
            seen.add(mid);
            stateChanged = true;
          }
        }
      }
    );

    if (config.markAsSeen && processedUids.length) {
      await mail.markSeen(processedUids);
      console.log(`已將 ${processedUids.length} 封含 PDF 的信件標記為已讀`);
    }
  } finally {
    await mail.logout();
    if (config.dedupe && stateChanged) {
      await saveState(config.stateFile, seen);
    }
  }

  console.log('—'.repeat(20));
  console.log(`完成：含 PDF 的信件 ${processedUids.length} 封，共下載 ${totalPdfs} 個 PDF。`);
  console.log(`輸出目錄：${config.downloadDir}`);
}

main().catch((err) => {
  console.error(`執行失敗：${err.message}`);
  process.exitCode = 1;
});
