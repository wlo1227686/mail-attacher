# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 這是什麼

一個 CLI 工具（`mail-pdf-fetcher`），透過 IMAP 連到信箱（**Yahoo / Gmail**，可擴充），
依寄件者／主旨／日期／信件夾／未讀等條件篩選信件，並把符合的 **PDF 附件**下載到本機資料夾。
ES modules、無建置步驟、無測試、未設定 linter。

## 常用指令

```bash
npm install

# 使用預設 .env 執行（npm start 走 dotenv 載入 .env）：
npm start                              # = node src/index.js

# 使用具名設定檔（一個來源一份 — .env.sinopac、.env.cathay…）：
node --env-file=.env.sinopac src/index.js
```

設定載入有兩條路徑，行為略有不同，動手前務必分清楚：

- `config.js` 第一行 `import 'dotenv/config'`，所以 `npm start`（即 `node src/index.js`）
  會由 **dotenv** 自動載入 `.env`。
- 具名設定檔（`.env.sinopac` 等）**只能**靠 `--env-file` 載入，這是 Node v20+ 才支援
  的功能，因此實際執行的最低門檻是 **Node v20**（`package.json` 寫 `engines.node >=18`，
  但 18 無法用具名設定檔）。

## 架構

由 `src/index.js` → `main()` 串起的單一線性流程。各模組都是純函式／class 匯出，
只在 `index.js` 裡組裝：

- **`providers.js`** — `resolveProvider()` 是支援的 Mail 服務（IMAP）連線資訊查表。
  Yahoo、Gmail 都走 IMAP、呼叫方式相同，差別只在目的端 host/port，**新增服務只要在
  `PROVIDERS` 加一筆**。`custom` 則改讀 `IMAP_HOST`／`IMAP_PORT`。
- **`config.js`** — `loadConfig()` 從 `process.env` 讀取所有設定，驗證必填的帳號與密碼
  （`MAIL_USER`／`MAIL_APP_PASSWORD`，相容舊名 `YAHOO_USER`／`YAHOO_APP_PASSWORD`），
  回傳一個固定形狀的設定物件（`provider`、`imap`、`filter`、`downloadDir`、`naming`、
  `dedupe`、`stateFile`…）。這是所有選項的**唯一真實來源 — 新增設定都加在這裡**。
  IMAP host/port 不再寫死，改由 `MAIL_PROVIDER`（預設 `yahoo`）經 `resolveProvider()` 帶入。
- **`mailClient.js`** — `MailClient` 包裝 `imapflow`。注意刻意的三段式抓取以壓低記憶體／
  成本：`search()`（只取 UID）→ `fetchEnvelopes()`（只取 Message-ID，供去重用）→
  `fetchSources()`（取完整原始信件，透過 callback 逐封串流處理，避免所有信件同時進記憶體）。
  `buildSearchQuery()` 把所有篩選條件在伺服器端以 AND 組合；無任何條件時退回 `{ all: true }`。
- **`pdfExtractor.js`** — `extractPdfs()` 用 `mailparser` 解析單封原始信件，留下 PDF 附件
  （依 content-type 或 `.pdf` 副檔名判定），套用可選的檔名關鍵字篩選後，依命名規則寫檔。
  `uniquePath()` 在檔名衝突時補 `_1`、`_2`。`buildFilename()` 的範本展開是兩段式：先處理
  具名佔位符（`{name} {date} {from} {subject} {original} {index}`），再處理像 `{YYYYMM}`
  這種純日期 token 群組（以信件發送時間格式化）。
- **`state.js`** — `loadState()`／`saveState()` 把已處理的 Message-ID 集合以 JSON 持久化。
  狀態檔損壞或不存在一律視為空集合（永不拋例外）。

### 去重流程（不直覺的部分）

`DEDUPE=true`（預設）時，**只有實際存下 PDF** 的信件才會把它的 Message-ID 記入狀態。
這是刻意的：日後若放寬篩選（例如拿掉 `FILTER_PDF_NAME`），先前被略過的附件仍能被補抓。
狀態檔只在 `finally` 區塊、且確有變動（`stateChanged`）時寫入一次。
**想重抓全部就刪掉狀態檔。**

## 設定參考

所有行為都由環境變數驅動；完整變數表、檔名範本 token、輸出目錄結構見 `README.md`。
PDF 落在 `DOWNLOAD_DIR/OUTPUT_FOLDER/`；去重狀態檔放在 `DOWNLOAD_DIR` 根層
（預設 `./output/processed.json`，但若 `STATE_FILE` 帶路徑分隔或為絕對路徑則照填的位置）。
以 `.env.example` 為範本複製出 `.env` 並填入帳密與篩選條件。

認證用的是各服務（Yahoo / Gmail）的**應用程式密碼**，不是帳號登入密碼。

## 慣例

- 程式註解與 console 輸出一律用**繁體中文** — 編輯時請沿用。
- 工具預設對信箱唯讀：不刪除、不搬移信件，僅在 `MARK_AS_SEEN=true` 時把信標記為
  `\Seen`（已讀）。
