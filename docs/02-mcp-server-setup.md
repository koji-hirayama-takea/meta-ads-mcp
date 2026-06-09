---
title: 自作 Meta Ads MCP サーバー インストール手順
status: canonical
last_updated: 2026-05-29
prerequisites: Meta 側発行作業完了 ([01-meta-app-setup.md](./01-meta-app-setup.md))
estimated_time: 5-10 分
---

# Meta Ads MCP サーバー セットアップ

Meta 側で Token 発行まで完了している前提の手順。

---

## 前提

- [01-meta-app-setup.md](./01-meta-app-setup.md) を完了 (System User Token を取得済み)
- Node.js 22+ がインストール済み (`node --version` で確認)
- このリポジトリを clone 済み

---

## Step 1: 依存インストール

```bash
cd meta-ads-mcp
npm install
```

主な依存:
- `@modelcontextprotocol/sdk` — MCP プロトコル実装
- `zod` — 入力スキーマ検証
- `zod-to-json-schema` — JSON Schema 変換 (MCP の inputSchema 生成用)
- `dotenv` — `.env.local` 読み込み
- `tsx` — TypeScript を直接実行 (build step 不要)
- `typescript` — 型チェック用

---

## Step 2: `.env.local` 作成

```bash
cp .env.example .env.local
```

`.env.local` を編集して以下を埋める (gitignored、絶対 commit 禁止):

```bash
# Meta System User Token (Step 01 で発行したやつ)
META_SYSTEM_USER_TOKEN=EAAxxxxxxxxxx...（あなたのトークンに置き換え）

# デフォルトの広告アカウント ID (act_ プレフィックス不要)
META_DEFAULT_ACCOUNT_ID=<YOUR_AD_ACCOUNT_ID>

# Graph API バージョン (Meta が定期的に更新するので適宜上げる)
META_GRAPH_API_VERSION=v24.0
```

---

## Step 3: 型チェック (任意)

```bash
npm run typecheck
```

エラーが出ないことを確認。`---tsc OK---` 的な無出力で成功。

---

## Step 4: stdio で smoke test

MCP サーバーを stdio で起動 → `tools/list` を叩いて 26 tools が返ってくるか確認:

```bash
(printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"0.1"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'; \
  sleep 1) | npx tsx src/index.ts 2>&1 | python3 -c "
import json, sys
for line in sys.stdin:
    line = line.strip()
    if not line.startswith('{'): continue
    try:
        d = json.loads(line)
        if d.get('id') == 2:
            tools = d['result']['tools']
            print(f'TOTAL TOOLS: {len(tools)}')
            for t in tools:
                print(f'  - {t[\"name\"]}')
    except: pass
"
```

期待出力:
```
TOTAL TOOLS: 26
  - get_campaigns
  - get_adsets
  - ...
  - clone_creative_with_url
```

---

## Step 5: 実 API smoke (1 tool 動作確認)

```bash
(printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"0.1"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_campaigns","arguments":{"limit":5}}}'; \
  sleep 3) | npx tsx src/index.ts 2>&1 | grep '"id":2'
```

期待: 広告アカウントの campaigns が JSON で返る。
失敗時のエラーパターンは [04-troubleshooting.md](./04-troubleshooting.md) を参照。

---

## Step 6: `.mcp.json` に登録 (Claude Code から使えるように)

リポジトリルートの `.mcp.json` に以下を追加:

```json
{
  "mcpServers": {
    "meta-ads": {
      "description": "自作 Meta Ads MCP - 26 tools, Pipeboard 代替",
      "command": "/absolute/path/to/meta-ads-mcp/bin/run.sh"
    }
  }
}
```

⚠️ **`command` は絶対パスで書く** (相対パスは Claude Code の起動位置で壊れる)

`bin/run.sh` の中身 (既に含まれてる):
```bash
#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
PROJECT_DIR="$( cd "$SCRIPT_DIR/.." &> /dev/null && pwd )"
cd "$PROJECT_DIR"
if [ ! -d "node_modules" ]; then
  npm install --silent
fi
exec npx --no-install tsx src/index.ts
```

→ Claude Code 再起動で `meta-ads` の 26 tools が認識される。

---

## Step 7: Claude Code で確認

Claude Code を起動 → `meta-ads` の tool が deferred tools として見えるはず。

最初の呼び出しで ToolSearch で schema を読み込んでから call すれば動く。

---

## 開発・デバッグ

### dev mode (watch)

```bash
npm run dev
```

→ `src/` の変更を即時反映 (tsx watch)

### Token 期限チェック

```bash
TOKEN=$(grep META_SYSTEM_USER_TOKEN .env.local | cut -d= -f2)
curl -s "https://graph.facebook.com/v24.0/debug_token?input_token=${TOKEN}&access_token=${TOKEN}" \
  | python3 -m json.tool
```

→ `expires_at` で残期間確認。

### Page アセット紐付け確認

```bash
TOKEN=$(grep META_SYSTEM_USER_TOKEN .env.local | cut -d= -f2)
curl -s "https://graph.facebook.com/v24.0/me/accounts?access_token=${TOKEN}" \
  | python3 -m json.tool
```

→ `data: []` だと Page 未紐付け、creative 作成系で必ず詰む

---

## トラブル時

[04-troubleshooting.md](./04-troubleshooting.md) を見る。

主な症状:
- `META_SYSTEM_USER_TOKEN missing` → `.env.local` 配置確認
- `(#190) session invalidated` → Token 期限切れ、再発行
- `(#3) capability` → Meta 側設定不足 (01-meta-app-setup.md Step 2/3/5 を順番に確認)
- `npx tsx` が見つからない → `npm install` 走ってない

---

## 関連ドキュメント

- [01-meta-app-setup.md](./01-meta-app-setup.md) — Meta 側発行作業
- [03-architecture.md](./03-architecture.md) — MCP の中身
- [04-troubleshooting.md](./04-troubleshooting.md) — エラー対処集
