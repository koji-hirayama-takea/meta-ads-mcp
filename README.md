# meta-ads-mcp

Meta (Facebook) Marketing API を Claude Code から直接操作する、自作の MCP サーバー。
System User Token で Graph API を叩く **26 tools**。自社の広告アカウントを自分で運用するだけなら、SaaS の月額課金なしで動かせます。

- 月額固定費ゼロ（自分の Meta 広告枠で動く）
- リクエスト回数の制限なし（Meta API のレート制限のみ）
- TypeScript なので自由に拡張可能

> ⚠️ このサーバーは **System User Token（広告アカウントの全権限を持つ鍵）** を使います。`.env.local` は絶対に commit せず、トークンはパスワード管理ツールに保管してください。

---

## 📚 ドキュメント目次

| ファイル | 内容 | 想定読者 |
|---|---|---|
| **[docs/01-meta-app-setup.md](./docs/01-meta-app-setup.md)** | Meta 側 管理画面での発行作業 (App / System User / Token) を画面操作レベルで | セットアップ担当者 (初回 + Token refresh 60日ごと) |
| **[docs/02-mcp-server-setup.md](./docs/02-mcp-server-setup.md)** | MCP サーバー側のインストール手順 | Claude Code 経由で使う人 |
| **[docs/03-architecture.md](./docs/03-architecture.md)** | アーキテクチャ・26 tools の中身・設計判断 | 拡張する人 (新 tool 追加など) |
| **[docs/04-troubleshooting.md](./docs/04-troubleshooting.md)** | ハマったエラー全集と回避方法 (特に `(#3) capability` 問題) | エラーに遭遇した人 |

---

## クイックスタート

### 初回セットアップ

1. **[docs/01-meta-app-setup.md](./docs/01-meta-app-setup.md)** を完走して System User Token を取得 (20-30 分)
2. **[docs/02-mcp-server-setup.md](./docs/02-mcp-server-setup.md)** で MCP インストール + `.mcp.json` 登録 (5-10 分)
3. Claude Code 再起動 → 26 tools が認識される

### 動作確認

```bash
cd meta-ads-mcp
cp .env.example .env.local   # 値を埋める (docs/01 参照)
npm install
npm run typecheck

# stdio smoke test
(printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"0.1"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_campaigns","arguments":{"limit":5}}}'; \
  sleep 3) | npx tsx src/index.ts 2>&1 | grep '"id":2'
```

---

## 26 ツール一覧

### 読み取り (8)

| Tool | 用途 |
|---|---|
| `get_ad_accounts` | アクセス可能な広告アカウント一覧 |
| `get_account_pages` | アカウントから配信可能な FB ページ一覧 |
| `get_campaigns` | キャンペーン一覧 |
| `get_adsets` | 広告セット一覧 |
| `get_ads` | 広告一覧 |
| `get_ad_creatives` | クリエ詳細 (link URL 確認用) |
| `get_insights` | 配信実績 (account/campaign/adset/ad + breakdowns) |
| `get_ad_previews` | プレースメント別プレビュー (HTML) |

### 検索 (2)

| Tool | 用途 |
|---|---|
| `search_geo_locations` | ターゲティング用 地域 ID 検索 |
| `search_interests` | ターゲティング用 interest ID 検索 |

### 新規作成 (5)

| Tool | 用途 |
|---|---|
| `create_campaign` | 新規キャンペーン (default PAUSED) |
| `create_adset` | 新規広告セット |
| `create_ad` | 新規広告 (creative_id 既存参照 or inline) |
| `create_ad_creative` | 新規クリエ (url_tags で UTM 仕込み可) |
| `upload_ad_image` | 画像 → image_hash 変換 |

### 更新・複製 (5)

| Tool | 用途 |
|---|---|
| `update_ad` | status / creative 差し替え / 入札 |
| `update_campaign` | status / 予算 / 入札戦略 |
| `update_adset` | status / 予算 / ターゲティング |
| `duplicate_ad` | A/B variant 用に広告複製 |
| `clone_creative_with_url` | **UTM 仕込みコア**。既存 creative を新 URL でクローン + ad 差し替え。`format=auto/link_data/asset_feed_spec` 切替可、auto は link_data 試行 → `#3` で asset_feed_spec フォールバック |

### 削除 / 一括 (4)

| Tool | 用途 |
|---|---|
| `delete_campaign` | キャンペーン soft delete (子 adset/ads も cascade)。実績は API 経由で参照可、UI からは消える |
| `delete_adset` | adset soft delete (子 ads も cascade) |
| `delete_ad` | ad 単体 soft delete |
| `bulk_pause_campaign` | キャンペーン + 配下 adset を一括 PAUSE。`cascade=true` がデフォルト |

### 診断 (2) — 配信トラブル切り分け

| Tool | 用途 |
|---|---|
| `diagnose_delivery` | アカウント全体ヘルスチェック。account 停止 / 残高不足 / ACTIVE 0 / DC 1-ad ルール抵触 / 直近 spend 急落 を 1 コールで検出 |
| `diagnose_adset` | adset 単体ヘルスチェック。status 不整合 / DC ルール / attribution-optimization mismatch / CV 50/週 未満 / 配信ゼロ / Meta 警告 を検出 |

> エラーメッセージは `src/types.ts` の `ERROR_HINTS` マップで主要 subcode に日本語ヒントを自動付与します。詳細: [`docs/04-troubleshooting.md`](./docs/04-troubleshooting.md)

---

## スタック

- Node.js 22 + ESM / `tsx` (ビルド不要・直接実行)
- `@modelcontextprotocol/sdk` (公式 stdio transport)
- `zod` + `zod-to-json-schema` (入力検証 → JSON Schema 自動変換)
- native `fetch` (HTTP)

---

## ライセンス

MIT License — [LICENSE](./LICENSE) を参照。
