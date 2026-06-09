# meta-ads-mcp — セットアップ案内（エージェント用）

このファイルは、Claude Code（や互換エージェント）がこのリポジトリのセットアップを
**対話的に案内・自動化**するための指示書です。

ユーザーが「**セットアップして**」「set up this MCP」「これ動かして」等と言ったら、
以下の手順を**1ステップずつ、順番に**実行してください。各ステップで結果を報告し、
次に進む前に必要な情報（特にトークン）をユーザーから受け取ること。

> このサーバーは Meta (Facebook) Marketing API を Claude Code から操作する MCP です。
> 全 26 tools。詳しい背景は [README.md](./README.md)、画面ごとの手順は [docs/](./docs/) を参照。

---

## 🔐 最優先の安全ルール（必ず守る）

- `META_SYSTEM_USER_TOKEN` は **広告アカウントの全権限を持つ鍵**。これが漏れると広告を乗っ取られます。
- `.env.local` は **絶対に commit / push しない**（`.gitignore` 済み）。
- トークンを **チャットのログやコミットメッセージに書かない**。ユーザーには「パスワード管理ツールに保管」を促す。
- `.mcp.json` を編集するときは **既存の内容を壊さない**（後述の create-or-merge）。

---

## セットアップ手順

### Step 0: 前提チェック

```bash
node --version   # 22 以上が望ましい
```

22 未満なら、その旨を伝えて Node のアップデートを促す（致命的ではないが推奨）。

### Step 1: 依存インストール

リポジトリ直下で：

```bash
npm install
npm run typecheck   # 型エラーが無ければ OK
```

### Step 2: Meta 側トークンの確認（ここが一番のヤマ）

ユーザーに尋ねる：**「Meta の System User Token は取得済みですか？」**

- **取得済み** → Step 3 へ。
- **未取得** → [docs/01-meta-app-setup.md](./docs/01-meta-app-setup.md) を読み込み、
  **1ステップずつ対話で案内**する。次の点を必ず守ること：
  - **クリック操作は人間が行う**。エージェントは「次はこの画面でこれを押す」と案内する役。
  - 各ステップでユーザーの「できた」を待ってから次へ進む。
  - 特に以下の**詰まりどころ**を先回りで伝える：
    1. ユースケースは「マーケティングAPIで広告を作成・管理」を選ぶ（「アプリ広告を作成・管理」はNG）
    2. 権限は6つ、特に `ads_management` / `ads_read` / `pages_manage_ads` の3つが必須
    3. アプリを「ライブ」にする（審査=App Review は自社運用なら**不要**）
    4. System User に **広告アカウント・アプリ・Facebookページの3つ**を紐付ける
       （**ページ紐付けを忘れると `(#3)` エラーで一日溶ける** — 最頻出の罠）
    5. トークンは有効期限60日で発行、scope 6つを全部チェック
  - **全部正しく設定したのに creative 作成で `(#3)` が出る問題**については、このMCPが
    `clone_creative_with_url` で自動回避する（link_data を試し、`(#3)` なら asset_feed_spec に
    自動フォールバック）ことを伝える。ユーザーが手で対処する必要はない。

### Step 3: `.env.local` の作成

```bash
cp .env.example .env.local
```

ユーザーに以下を尋ねて `.env.local` に記入する（値はチャットに残さない配慮を促す）：

- `META_SYSTEM_USER_TOKEN` = Step 2 で発行したトークン（`EAA...`）
- `META_DEFAULT_ACCOUNT_ID` = 広告アカウントID（数字のみ、`act_` 不要）
- `META_GRAPH_API_VERSION` は `v24.0` のままでOK

### Step 4: `.mcp.json` への登録（create-or-merge）

**登録先**: いまユーザーが Claude Code を開いている**プロジェクトのルート**の `.mcp.json`。

まず `bin/run.sh` の**絶対パス**を取得：

```bash
echo "$(pwd)/bin/run.sh"
```

登録するエントリ（サーバー名は `meta-ads`）：

```json
{
  "mcpServers": {
    "meta-ads": {
      "command": "/絶対パス/meta-ads-mcp/bin/run.sh"
    }
  }
}
```

**書き込みルール（厳守）**：

1. プロジェクトルートに `.mcp.json` が **無ければ** → 上記内容で**新規作成**。
2. **有れば** → ファイルを読み、JSON をパースして `mcpServers` に `meta-ads` を**追記（マージ）**。
   **他のサーバー定義や他のキーは絶対に消さない**。
3. すでに `meta-ads` が **存在する場合** → 重複追加せず、その1エントリの `command` を**更新するだけ**（冪等）。
4. `command` は必ず**絶対パス**（相対パスは Claude Code の起動位置で壊れる）。
5. 書き込み**前に**、追記後の `.mcp.json` の差分（または該当エントリ）をユーザーに提示して確認する。

### Step 5: 疎通テスト

`.mcp.json` 反映には **Claude Code の再起動が必要**。エージェントは自分を再起動できないので、
ユーザーに「**Claude Code を再起動してください**」と案内する。

再起動後、ユーザーに次を試してもらう：

> 「広告アカウントの情報を見せて」

`get_ad_accounts` が呼ばれ、アカウント名や残高が返れば**接続成功**。
返らない場合は [docs/04-troubleshooting.md](./docs/04-troubleshooting.md) を参照して切り分ける
（多くは「トークン期限切れ」か「ページ紐付け漏れ」）。

---

## 完了の合図

- `npm install` / `typecheck` 通過
- `.env.local` にトークン記入済み（commit されていないことを確認）
- プロジェクトの `.mcp.json` に `meta-ads` エントリが**他を壊さず**追記済み
- 再起動後に `get_ad_accounts` が成功

ここまで来たら「セットアップ完了。あとは日本語で『今週の数字どう？』『この訴求でクリエイティブ作って』
のように話しかければ動きます」と案内して終了。
