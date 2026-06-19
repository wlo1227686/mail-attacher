# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A CLI tool (`yahoo-mail-pdf-fetcher`) that connects to Yahoo Mail over IMAP, filters
messages by sender/subject/date/folder/unread, and downloads matching **PDF attachments**
to a local directory. ES modules, no build step, no tests, no linter configured.

## Commands

```bash
npm install

# Run with the default .env (config is loaded purely from env vars):
npm start                                   # = node --env-file=.env src/index.js

# Run with a named profile (one per mail source — .env.sinopac, .env.cathay, …):
node --env-file=.env.sinopac src/index.js
```

Requires **Node v20+** at runtime: the entrypoint depends on `--env-file`, which is the
only way config reaches the program. `dotenv/config` is also imported in `config.js`, so
`.env` is loaded even when `--env-file` is absent — but named profiles only work via
`--env-file`. (`package.json` says `engines.node >=18`, but v20 is the real floor.)

## Architecture

Single linear pipeline orchestrated by `src/index.js` → `main()`. Modules are plain
function/class exports, wired together only in `index.js`:

- **`config.js`** — `loadConfig()` reads every setting from `process.env`, validates the
  two required vars (`YAHOO_USER`, `YAHOO_APP_PASSWORD`), and returns one frozen-shape
  config object (`imap`, `filter`, `downloadDir`, `naming`, `dedupe`, `stateFile`, …).
  This is the single source of truth for all options — add new settings here.
- **`mailClient.js`** — `MailClient` wraps `imapflow`. Note the deliberate three-stage
  fetch to keep memory/cost low: `search()` (UIDs) → `fetchEnvelopes()` (Message-IDs
  only, for dedupe) → `fetchSources()` (full raw message, streamed one-at-a-time via
  callback so all mail is never in memory at once). `buildSearchQuery()` ANDs all filters
  server-side; empty filter becomes `{ all: true }`.
- **`pdfExtractor.js`** — `extractPdfs()` parses one raw message with `mailparser`, keeps
  PDF attachments (by content-type or `.pdf` extension), applies the optional filename
  keyword filter, then names and writes each file. `uniquePath()` adds `_1`, `_2` on
  collision. Filename templating is two-pass in `buildFilename()`: first named
  placeholders (`{name} {date} {from} {subject} {original} {index}`), then bare date-token
  groups like `{YYYYMM}` formatted from the message send-time.
- **`state.js`** — `loadState()`/`saveState()` persist a Set of processed Message-IDs as
  JSON. Corrupt/missing state is treated as empty (never throws).

### Dedupe flow (the non-obvious part)

When `DEDUPE=true` (default), only messages from which a PDF was **actually saved** get
their Message-ID recorded. This is intentional: if you later loosen filters (e.g. drop
`FILTER_PDF_NAME`), previously-skipped attachments are still picked up. State is written
once in the `finally` block, and only if something changed (`stateChanged`). Delete the
state file to re-fetch everything.

## Config reference

All behavior is env-driven; see `README.md` for the full table of variables, the filename
templating tokens, and the output-directory layout. PDFs land in
`DOWNLOAD_DIR/OUTPUT_FOLDER/`; the dedupe state file lives at the `DOWNLOAD_DIR` root
(default `./output/processed.json`). No `.env.example` is committed despite README
references — create `.env` by hand from the README variable table.

Auth uses a Yahoo **app password**, not the account password (IMAP host is hardcoded to
`imap.mail.yahoo.com:993` in `config.js`).

## Conventions

- Code comments and console output are in **Traditional Chinese** — match this when editing.
- The tool is read-only toward the mailbox by default; it never deletes/moves mail and only
  marks messages `\Seen` when `MARK_AS_SEEN=true`.
