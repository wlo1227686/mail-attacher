/**
 * 支援的 Mail 服務（IMAP）連線資訊查表。
 * Yahoo、Gmail 等都走 IMAP，呼叫方式完全相同，差別只在目的端 host / port；
 * 新增服務只要在這裡加一筆即可。
 */
const PROVIDERS = {
  yahoo: { host: 'imap.mail.yahoo.com', port: 993, secure: true },
  gmail: { host: 'imap.gmail.com', port: 993, secure: true },
};

/**
 * 依 provider 名稱回傳對應的 IMAP 連線資訊（host / port / secure）。
 * provider 為 `custom` 時改用傳入的 host / port（讓自架或其他服務也能用）。
 * @param {string} name provider 名稱（不分大小寫）
 * @param {{host?:string, port?:number}} [custom] custom 時的連線資訊
 */
export function resolveProvider(name, custom = {}) {
  const key = (name || 'yahoo').trim().toLowerCase();

  if (key === 'custom') {
    if (!custom.host) {
      throw new Error('MAIL_PROVIDER=custom 時必須設定 IMAP_HOST');
    }
    return { host: custom.host, port: custom.port || 993, secure: true };
  }

  const found = PROVIDERS[key];
  if (!found) {
    const supported = [...Object.keys(PROVIDERS), 'custom'].join('、');
    throw new Error(`不支援的 MAIL_PROVIDER：${name}（可用：${supported}）`);
  }
  return found;
}

export { PROVIDERS };
