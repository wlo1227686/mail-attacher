# Mail PDF 撈取工具

從信箱（**Yahoo / Gmail**，可擴充）依指定條件（寄件者、主旨、日期區間、信件夾／未讀）
篩選信件，自動下載信件內的 **PDF 附件** 到本機資料夾。透過 IMAP + 應用程式密碼存取。
Yahoo、Gmail 都走 IMAP、呼叫方式相同，只需用 `MAIL_PROVIDER` 切換目的端服務。

## 需求
- Node.js v20 以上（執行需要 `--env-file`，該功能自 v20 起提供）

## 安裝
```bash
npm install
```

## 取得應用程式密碼
不論 Yahoo 或 Gmail，都不允許第三方程式用一般登入密碼，必須使用「應用程式密碼」：

**Yahoo**
1. 登入 Yahoo → 帳號資訊 → **帳號安全**
2. 找到「產生應用程式密碼」(Generate app password)
3. 命名（例如 `pdf-fetcher`）後產生，複製那串密碼

**Gmail**
1. 先在 Google 帳戶開啟**兩步驟驗證**（未開啟就不會有應用程式密碼選項）
2. Google 帳戶 → 安全性 → **應用程式密碼**
3. 命名後產生，複製那串 16 碼密碼

> 兩者都需先開啟兩步驟驗證才能產生應用程式密碼。

## 設定
複製範本並填入帳號與篩選條件：
```bash
cp .env.example .env
```

也可以為不同來源各建一份具名設定檔（例如 `.env.sinopac`、`.env.cathay`），
執行時再指定要用哪一份（見下方「執行」）。

設定說明：

| 變數 | 說明 |
|------|------|
| `MAIL_PROVIDER` | Mail 服務：`yahoo`（預設）／`gmail`／`custom`；決定 IMAP 連線目的端 |
| `MAIL_USER` | 信箱完整地址（必填） |
| `MAIL_APP_PASSWORD` | 上一步取得的應用程式密碼（必填） |
| `IMAP_HOST` / `IMAP_PORT` | 僅 `MAIL_PROVIDER=custom` 時需要，自訂 IMAP 主機與埠（預設埠 993） |
| `FILTER_FROM` | 只抓此寄件者的信 |
| `FILTER_SUBJECT` | 主旨需包含的關鍵字 |
| `FILTER_SINCE` / `FILTER_BEFORE` | 日期區間，格式 `YYYY-MM-DD`（含起、不含迄） |
| `FILTER_MAILBOX` | 信件夾，預設 `INBOX` |
| `FILTER_UNSEEN` | `true` 只抓未讀 |
| `FILTER_PDF_NAME` | PDF 附件檔名關鍵字（子字串、不分大小寫）；留空不篩選 |
| `DOWNLOAD_DIR` | 下載根目錄，預設 `./output`（不存在會自動建立） |
| `OUTPUT_FOLDER` | 主資料夾；PDF 放在 `DOWNLOAD_DIR/<主資料夾>/`，留空則直接放根目錄 |
| `MARK_AS_SEEN` | `true` 時把已下載 PDF 的信標記為已讀（預設 `false`） |
| `DEDUPE` | `true` 時記錄已下載信件的 Message-ID，下次自動跳過（預設 `true`） |
| `STATE_FILE` | 去重狀態檔名，放在 `DOWNLOAD_DIR` 根層，預設 `processed.json`（可自訂；帶路徑則照填的位置） |
| `FILENAME_NAME` | 自訂固定檔名（範本裡的 `{name}`） |
| `FILENAME_DATE_FORMAT` | 依發送時間格式化的日期字串（見下方） |
| `FILENAME_TEMPLATE` | 下載檔名範本（見下方） |

篩選條件留空即不套用；多個條件以 **AND** 組合。

## 下載檔名規則
檔名由「發送時間 + 範本」決定，兩者皆可在 `.env` 自訂。

**`FILENAME_DATE_FORMAT`** — 把信件發送時間格式化成字串，可用 token：

| token | 意義 | token | 意義 |
|-------|------|-------|------|
| `YYYY` | 年 | `HH` | 時(24) |
| `MM` | 月 | `mm` | 分 |
| `DD` | 日 | `ss` | 秒 |

其餘字元（`-` `_` `/` 等）原樣保留。例：`YYYY-MM-DD_HHmmss` → `2026-06-18_143052`。

**`FILENAME_TEMPLATE`** — 檔名範本，可用佔位符：

| 佔位符 | 內容 |
|--------|------|
| `{name}` | `FILENAME_NAME` 設定的固定檔名 |
| `{date}` | 上面格式化後的發送時間 |
| `{from}` | 寄件者帳號（email 的 @ 前段） |
| `{subject}` | 信件主旨 |
| `{original}` | 原始附件檔名 |
| `{index}` | 同一封信的第幾個 PDF（1 起算） |

`.pdf` 副檔名自動補上；檔名重複時自動加 `_1`、`_2`。
預設 `FILENAME_TEMPLATE={name}.{date}` 配 `YYYYMMDD_HHmmss`，
`FILENAME_NAME=XXXXXXXXX` → `XXXXXXXXX.20260618_143052.pdf`。

## 輸出目錄結構
PDF 放在「下載根目錄 / 主資料夾」，去重狀態檔放在下載根目錄。例如
`DOWNLOAD_DIR=./output`、`OUTPUT_FOLDER=永豐銀行信用卡`、`STATE_FILE=sinopac.processed.json`：

```
output/
  sinopac.processed.json      # 去重狀態檔
  永豐銀行信用卡/
    202606_....pdf
    202605_....pdf
```

## 避免重複下載（去重）
預設開啟（`DEDUPE=true`）。每封**成功下載**的信會把它的 Message-ID 記到 `STATE_FILE`
（預設 `processed.json`，放在 `DOWNLOAD_DIR` 根層），下次執行時在下載前先比對、跳過已處理的信，
因此不會重複下載、也不會產生 `_1`、`_2` 重複檔。

- 想重新抓全部：刪除狀態檔即可。
- 只記錄「有下載到 PDF」的信；若日後放寬條件（例如拿掉 `FILTER_PDF_NAME`），
  先前沒下載到的附件仍會被補抓。
- 設 `DEDUPE=false` 可完全關閉去重。

## 執行
使用預設的 `.env`：
```bash
npm start
# 等同於
node --env-file=.env src/index.js
```

使用具名設定檔（例如 `.env.sinopac`）：
```bash
node --env-file=.env.sinopac src/index.js
node --env-file=.env.fet_telecom src/index.js
```

> 需要 Node v20+ 才支援 `--env-file`。執行時會先印出信件夾、套用的篩選條件、
> 輸出目錄與去重狀態檔路徑，再逐封下載並顯示進度。

## 注意
- `.env` 與 `output/` 已列入 `.gitignore`，不會進版控。
- 預設不刪除、不搬移信件，僅讀取並下載附件。
