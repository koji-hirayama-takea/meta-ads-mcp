---
title: 自作 Meta Ads MCP アーキテクチャ
status: canonical
last_updated: 2026-05-29
---

# Meta Ads MCP アーキテクチャ

`meta-ads-mcp/` の中身を解説。26 tools の実装、Graph API ラッパー、stdio MCP プロトコルの実装。

---

## スタック

| レイヤ | 採用 | 理由 |
|---|---|---|
| Runtime | Node.js 22 + ESM | MCP SDK が公式 TS なので |
| 実行方式 | `tsx` (no build step) | ローカル stdio 専用、コンパイル不要 |
| MCP SDK | `@modelcontextprotocol/sdk` v1.20+ | 公式 stdio transport 使用 |
| 入力検証 | `zod` + `zod-to-json-schema` | MCP の inputSchema は JSON Schema 必須、zod から自動変換 |
| HTTP | native `fetch` (Node 22) | axios 等不要 |
| Env 読み込み | `dotenv` (lazy) | ES module hoisting 問題回避のため lazy load |

---

## ディレクトリ構造

```
meta-ads-mcp/
├── package.json            ← meta-ads-mcp v0.1.0
├── tsconfig.json           ← strict + ESNext + Bundler resolution
├── .env.example            ← テンプレ (.env.local は gitignored)
├── .env.local              ← Token 等 (gitignored)
├── .gitignore
├── README.md               ← index ページ
├── docs/                   ← このフォルダ
├── bin/
│   └── run.sh              ← .mcp.json から呼ばれる stdio entry
└── src/
    ├── index.ts            ← MCP server エントリ、tool 登録 + dispatch
    ├── graph-client.ts     ← Graph API ラッパー (fetch + retry + error 正規化)
    ├── types.ts            ← Campaign / Adset / Ad / Insights 等の型 + GraphApiError
    └── tools/
        ├── get-campaigns.ts
        ├── get-adsets.ts
        ├── get-ads.ts
        ├── get-ad-creatives.ts
        ├── get-insights.ts
        ├── get-ad-accounts.ts
        ├── get-account-pages.ts
        ├── get-ad-previews.ts
        ├── search-geo-locations.ts
        ├── search-interests.ts
        ├── update-ad.ts
        ├── update-campaign.ts
        ├── update-adset.ts
        ├── create-campaign.ts
        ├── create-adset.ts
        ├── create-ad.ts
        ├── create-ad-creative.ts
        ├── upload-ad-image.ts
        ├── duplicate-ad.ts
        ├── clone-creative-with-url.ts   ← UTM 仕込み専用 (asset_feed_spec 経路)
        ├── delete-campaign.ts
        ├── delete-adset.ts
        ├── delete-ad.ts
        ├── bulk-pause-campaign.ts
        ├── diagnose-delivery.ts
        └── diagnose-adset.ts
```

---

## 26 Tools の中身

### Read 系 (8)

| Tool | Graph API endpoint | 用途 |
|---|---|---|
| `get_ad_accounts` | `GET /me/adaccounts` | アクセス可能な広告アカウント一覧 |
| `get_account_pages` | `GET /act_xxx/promote_pages` | アカウントから配信可能な FB ページ一覧 (creative の page_id 取得用) |
| `get_campaigns` | `GET /act_xxx/campaigns` | キャンペーン一覧 |
| `get_adsets` | `GET /<campaign_id>/adsets` | 広告セット一覧 |
| `get_ads` | `GET /<adset_id_or_campaign_id>/ads` | 広告一覧 |
| `get_ad_creatives` | `GET /<creative_id>` または `/<ad_id>/adcreatives` | クリエ詳細 |
| `get_insights` | `GET /<entity_id>/insights` | account/campaign/adset/ad の任意レベルで配信実績 |
| `get_ad_previews` | `GET /<ad_id_or_creative_id>/previews` | プレースメント別 プレビュー HTML |

### Search 系 (2)

| Tool | endpoint | 用途 |
|---|---|---|
| `search_geo_locations` | `GET /search?type=adgeolocation` | ターゲティング用 地域 ID 検索 |
| `search_interests` | `GET /search?type=adinterest` | ターゲティング用 interest ID 検索 |

### Create 系 (5)

| Tool | endpoint | 用途 |
|---|---|---|
| `create_campaign` | `POST /act_xxx/campaigns` | 新規キャンペーン (default PAUSED) |
| `create_adset` | `POST /act_xxx/adsets` | 新規広告セット (targeting / promoted_object 必須) |
| `create_ad` | `POST /act_xxx/ads` | 新規広告 (creative_id 既存参照 or inline spec) |
| `create_ad_creative` | `POST /act_xxx/adcreatives` | 新規クリエ (url_tags も指定可) |
| `upload_ad_image` | `POST /act_xxx/adimages` (multipart) | 画像 → image_hash 変換 |

### Update / Duplicate 系 (5)

| Tool | endpoint | 用途 |
|---|---|---|
| `update_ad` | `POST /<ad_id>` | status / creative_id 差し替え / 入札 |
| `update_campaign` | `POST /<campaign_id>` | status / 予算 / 入札戦略 |
| `update_adset` | `POST /<adset_id>` | status / 予算 / targeting |
| `duplicate_ad` | `POST /<ad_id>/copies` | A/B 用に広告複製 |
| `clone_creative_with_url` | `POST /act_xxx/adcreatives` (asset_feed_spec) | **UTM 仕込みコア**。既存 creative を新 URL でクローン + ad に差し替え |

### Delete 系 (3)

| Tool | endpoint | 用途 |
|---|---|---|
| `delete_campaign` | `POST /<campaign_id>` (status → DELETED) | キャンペーン soft-delete。子 adset/ad もカスケード削除。insights は API から引き続き参照可 |
| `delete_adset` | `POST /<adset_id>` (status → DELETED) | 広告セット soft-delete。子 ad もカスケード削除 |
| `delete_ad` | `POST /<ad_id>` (status → DELETED) | 単一広告 soft-delete。一括整理は delete_campaign / delete_adset 推奨 (カスケードが速い) |

### Diagnose / Ops 系 (3)

| Tool | endpoint | 用途 |
|---|---|---|
| `bulk_pause_campaign` | `POST /<campaign_id>` + 各 adset | キャンペーン + 配下 adset を一括 PAUSE (default cascade=true)。paused 件数 + 失敗を返す |
| `diagnose_delivery` | 複合 (`GET` 多段) | アカウント全体の配信ヘルスチェック。残高/有効 adset/DC ルール違反/急減 等の issues リストを返す。設定は正常なのに配信が出ない時に使う |
| `diagnose_adset` | 複合 (`GET` 多段) | 単一 adset のヘルスチェック。status 不整合/DC 1-ad ルール/CV 閾値/配信ゼロ 等の issues を返す |

---

## 設計判断のポイント

### 1. `tsx` で no build step

`@suthio/redash-mcp` などは tsc → dist/ → node 起動の典型パターンだが、本プロジェクトはローカル運用専用なので `tsx src/index.ts` 直接実行で十分。

利点:
- pull 後すぐ動く (build step 不要)
- src 編集 → 即反映
- dist フォルダ管理不要

欠点:
- 起動が若干遅い (10-30ms くらい、stdio MCP では誤差)

### 2. 環境変数の lazy 読み込み

`graph-client.ts` で:
```typescript
function token(): string {
  const t = process.env.META_SYSTEM_USER_TOKEN;
  if (!t) throw new Error("...");
  return t;
}
```

トップレベルで `const TOKEN = process.env.X` すると ES module の hoisting で **dotenv 読み込み前に評価されてしまう**。lazy 化で回避。

### 3. zod スキーマ → JSON Schema 自動変換

MCP の `tools/list` レスポンスは `inputSchema` が JSON Schema 必須。

```typescript
import { zodToJsonSchema } from "zod-to-json-schema";

const schema = z.object({
  ad_id: z.string(),
  status: z.enum(["ACTIVE", "PAUSED"]).optional(),
});

const jsonSchema = zodToJsonSchema(schema, { $refStrategy: "none", target: "openApi3" });
```

→ MCP クライアント (Claude Code 等) がツールの引数を理解できる。

### 4. retry with exponential backoff

Meta API は rate limit でちょいちょい落ちる:
```typescript
async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  // code 4/17/32/613 (rate limit) or 5xx は retry
  // 2 → 4 → 8 秒 backoff
}
```

### 5. エラーを `GraphApiError` クラスに正規化

```typescript
export class GraphApiError extends Error {
  constructor(
    message: string,
    public readonly code: number,
    public readonly type: string,
    public readonly fbtrace_id?: string,
    ...
  ) { ... }
}
```

→ Claude Code 側で `code === 3` でハンドリング等が可能。

### 6. multipart upload (画像アップロード)

`upload_ad_image` は `POST /act_xxx/adimages` で multipart/form-data 必須。

```typescript
const form = new FormData();
form.append(filename, new Blob([buffer], { type: "image/png" }), filename);
form.append("access_token", token());
await fetch(url, { method: "POST", body: form });
```

native `FormData` + `Blob` (Node 22) で動く。`form-data` ライブラリ不要。

### 7. `clone_creative_with_url` の workaround

**最大の発見**: `POST /act_xxx/adcreatives` を `object_story_spec.link_data` で叩くと `(#3) capability` で拒否される (App が未公開 or `pages_manage_posts` 不足時)。

代わりに `asset_feed_spec` (Dynamic Creative) 経路で叩くと、内部で page post を生成しないため `ads_management` のみで通る。

```typescript
// 旧 (拒否される):
body = {
  object_story_spec: {
    page_id: "...",
    link_data: { link: NEW_URL, message: "...", call_to_action: {...} }
  }
};

// 新 (通る):
body = {
  object_story_spec: { page_id: "..." },  // page_id だけ
  asset_feed_spec: {
    images: [{ hash: IMAGE_HASH }],
    bodies: [{ text: MESSAGE }],
    titles: [{ text: TITLE }],
    link_urls: [{ website_url: NEW_URL }],
    call_to_action_types: ["SIGN_UP"],
    ad_formats: ["SINGLE_IMAGE"]
  }
};
```

詳細経緯: [04-troubleshooting.md](./04-troubleshooting.md) §「`(#3) capability` の完全解決」

---

## MCP プロトコル: tool/list と tool/call

### `tools/list` レスポンス

```typescript
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(t.schema, ...) as Tool["inputSchema"],
  })),
}));
```

→ 26 tools の name + description + inputSchema が返る

### `tools/call` レスポンス

```typescript
server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const tool = TOOLS.find((t) => t.name === req.params.name);
  const parsed = tool.schema.safeParse(req.params.arguments);
  if (!parsed.success) {
    return { content: [{ type: "text", text: "Invalid arguments: ..." }], isError: true };
  }
  const result = await tool.handler(parsed.data);
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});
```

→ 入力検証 (zod) → handler 呼び出し → 結果を JSON 文字列で返す

---

## Pipeboard との比較

| 観点 | Pipeboard | 自作 (本MCP) |
|---|---|---|
| 月額 | $0 (Free) / $25 (Pro) | $0 |
| API クォータ | Free=週30 req | Meta API 自体のレート制限のみ (実質ほぼ無限) |
| ツール数 | 100+ | 26 (運用に必要なものに絞る) |
| 認証 | Pipeboard 経由 (彼らの App + Meta Business Partner Badge) | 自社の System User Token 直接 |
| App Review | Pipeboard 側で済 | 自社で対応 (今は asset_feed_spec workaround で回避) |
| カスタマイズ性 | 不可 (彼らの実装に依存) | 任意 (TS で自由に拡張) |
| メンテ | Pipeboard 側 | 自分 (Meta API 破壊的変更時のみ、年1-2回) |

---

## 拡張方針

新規 tool 追加するときは:

1. `src/tools/<new-tool>.ts` を作成 (zod schema + handler)
2. `src/index.ts` に import + TOOLS 配列に追加
3. README.md / docs/03-architecture.md の tool 一覧に追記
4. smoke test

未実装で将来必要になりそうなもの:
- `create_custom_audience` / `create_lookalike_audience` (LTV ターゲ用)
- `create_lead_gen_form` (LP なし直接フォーム)
- `bulk_*` 系 (個別 call ループで代替できるので優先度低)
- カタログ系 (商品データフィード必要、今は使わない)

---

## 関連ドキュメント

- [01-meta-app-setup.md](./01-meta-app-setup.md) — Meta 側発行作業
- [02-mcp-server-setup.md](./02-mcp-server-setup.md) — MCP インストール
- [04-troubleshooting.md](./04-troubleshooting.md) — 詰まった経緯
- [05-publishable-knowledge.md](./05-publishable-knowledge.md) — 発信用ナレッジ
