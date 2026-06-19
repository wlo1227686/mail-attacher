import { ImapFlow } from 'imapflow';

/**
 * 依篩選條件組出 imapflow 的 search query。
 * 多條件物件屬性彼此為 AND 關係。
 */
function buildSearchQuery(filter) {
  const query = {};
  if (filter.from) query.from = filter.from;
  if (filter.subject) query.subject = filter.subject;
  if (filter.since) query.since = filter.since;
  if (filter.before) query.before = filter.before;
  if (filter.unseen) query.seen = false;
  // 完全沒條件時，回傳 { all: true } 抓整個信件夾
  return Object.keys(query).length ? query : { all: true };
}

export class MailClient {
  constructor(imapConfig) {
    this.client = new ImapFlow(imapConfig);
  }

  async connect() {
    await this.client.connect();
  }

  async logout() {
    try {
      await this.client.logout();
    } catch {
      // 連線可能已關閉，忽略
    }
  }

  /**
   * 開啟信件夾並依條件搜尋，回傳符合的 UID 陣列。
   */
  async search(filter) {
    await this.client.mailboxOpen(filter.mailbox);
    const query = buildSearchQuery(filter);
    const uids = await this.client.search(query, { uid: true });
    return uids || [];
  }

  /**
   * 只抓 envelope（含 Message-ID），不下載信件本文，成本低。
   * 用於下載前的去重比對。
   * @returns {Promise<Array<{uid:number, messageId:string|null}>>}
   */
  async fetchEnvelopes(uids) {
    const out = [];
    for await (const msg of this.client.fetch(
      uids,
      { uid: true, envelope: true },
      { uid: true }
    )) {
      out.push({ uid: msg.uid, messageId: msg.envelope?.messageId || null });
    }
    return out;
  }

  /**
   * 逐封取出原始郵件內容（Buffer），透過 callback 處理後再進下一封，
   * 避免一次把所有信件載入記憶體。
   */
  async fetchSources(uids, onMessage) {
    for await (const msg of this.client.fetch(
      uids,
      { uid: true, source: true },
      { uid: true }
    )) {
      await onMessage(msg.uid, msg.source);
    }
  }

  async markSeen(uids) {
    if (!uids.length) return;
    await this.client.messageFlagsAdd(uids, ['\\Seen'], { uid: true });
  }
}

export { buildSearchQuery };
