---
title: Meta 側 管理画面での発行作業 (完全ガイド)
status: canonical
last_updated: 2026-05-29
applies_to: Meta Business Manager + Meta for Developers
estimated_time: 20-30 分 (初回)
---

# Meta 側 管理画面 発行作業ガイド

自作 Meta Ads MCP を動かすために、Meta 側で必要な全ての発行作業を順番に。
スクリーンショット代わりに「どの画面で何をクリックするか」を細かく書く。

> **前提**:
> - Meta Business Manager (自社) のオーナー権限がある
> - 配信したい広告アカウントが Business Manager 配下にある
> - 配信したい Facebook ページが Business Manager 配下にある

---

## 全体像 (5 ステップ)

```
[Meta for Developers]                [Meta Business Manager]
─────────────────────                ─────────────────────
1. App 新規作成 ───────────┐
                            ▼
                         紐付け
                            ▼
2. ユースケース「広告を作成・管理」追加
3. permission 設定 (6 つ)
4. App を「ライブ」公開             ┌── 5. System User 作成
                                    │       └── アセット紐付け
                                    │            ├── 広告アカウント
                                    │            ├── App (= 1 で作ったやつ)
                                    │            └── Facebook ページ ⚠️ 忘れがち
                                    │       └── Token 生成 (scope 6 つ)
                                    └────────────────────────────
```

---

## Step 1: Meta App 新規作成

### 1.1 Meta for Developers にアクセス

<https://developers.facebook.com/apps/>

「マイアプリ」画面 → 右上 **「アプリを作成」** をクリック

### 1.2 ユースケース選択

「ユースケースを追加」画面で:

- **チェック ✅** : 「マーケティングAPIで広告を作成・管理」
- **チェック ❌** : 「Meta広告マネージャでアプリ広告を作成・管理」 (← これはモバイルアプリ用、選ぶと Marketing API アクセス含まれない)

→ **「次へ」**

### 1.3 アプリタイプ選択

**「ビジネス」** を選択 → **「次へ」**

### 1.4 アプリ情報入力

| 項目 | 入力値 |
|---|---|
| アプリ名 | `mcp` 等 (識別用、何でも OK) |
| 連絡先メール | あなたの連絡先メールアドレス |
| **ビジネスアカウント** | **自社のビジネスアカウントを選択** ⚠️ ここ重要 (Business Manager に紐付け) |

→ **「アプリを作成」**

**罠**: ビジネスアカウント未選択で作ると後で「個人 App」扱いになり Page アクセス周りで詰む。必ずここで紐付ける。

### 1.5 App ID をメモ

作成後、アプリダッシュボード左上のアプリ選択ドロップダウン横などに App ID が表示される (例: `<YOUR_APP_ID>`)。後で使う。

---

## Step 2: ユースケース permission 設定

### 2.1 ユースケース画面に移動

左サイドバー **「ユースケース」** → 「広告を作成・管理」 をクリック

### 2.2 「アクセス許可と機能」タブ

リスト形式で permission が並ぶ。**以下 6 つを「+追加」 (もしくは「テスト準備完了」ステータスに)** :

| Permission | 必須度 | 用途 |
|---|---|---|
| `ads_management` | ⭐ 必須 | 広告作成・更新 |
| `ads_read` | ⭐ 必須 | insights 読み取り |
| `business_management` | 推奨 | Business Manager API |
| `pages_manage_ads` | ⭐ 必須 (creative 作成に絶対必要) | Page を経由した creative 作成 |
| `pages_read_engagement` | 推奨 | Page insights 読み取り |
| `pages_show_list` | 任意 | 配信可能ページ一覧 |

**「Business Asset User Profile Access」は不要** (チェック外したまま)

#### 罠: `pages_manage_ads` を入れ忘れると...

`POST /act_xxx/adcreatives` が `(#3) Application does not have the capability` で失敗する。最初 `ads_management` だけで足りると思い込みやすいが、creative は内部的に「ページの代理投稿」扱いなので Page 権限が必要。

### 2.3 Marketing API Access Tier はそのまま

「Limited access」のままで OK。「Standard access」への昇格は App Review が必要だが、自社アカウント運用なら **Limited のままで全機能使える** (詳細は 04-troubleshooting.md)。

---

## Step 3: App をライブモードに公開

### 3.1 公開画面に移動

左サイドバー **「公開」** をクリック (バッジに「未公開」と表示されてるはず)

「アプリのカスタマイズと要件」セクションで:
- ✅ ユースケースのカスタマイズ
- ✅ ユースケースのテスト
- ✅ 必須設定の完了

全てクリアしてれば「必要なアプリの設定がすべて完了しました」と表示。

### 3.2 公開

**右下「公開する」** ボタンをクリック。

確認ダイアログが出たら確定。

**「未公開」バッジが消える** → ライブモードに切り替わった。

#### Q. ライブにすると誰かに使われる?

**No, 構造的にゼロリスク**:
- 「ライブモード」= API 解放スイッチであって、誰でも使える状態ではない
- App secret や System User Token を持ってる人しか叩けない
- 「Login with Facebook」ボタンを作って世に出さない限り、第三者 OAuth も発生しない
- 内部 SaaS バックエンドとしてだけ使う前提なら完全安全

#### Q. なぜライブにしないとダメ?

`POST /act_xxx/adcreatives` の capability check が Development mode だと厳しい。ライブ + System User Token + 自社アセット運用 で初めて creative 系の write API が通る。

(注: ライブにしても `pages_manage_ads` が無いと結局 #3 で詰むので、Step 2.2 でちゃんと付けること)

---

## Step 4: System User 作成 (Business Manager)

### 4.1 Business Manager の System Users 画面

<https://business.facebook.com/settings/system-users>

### 4.2 既存の System User を使うか新規作成

#### 既存があれば

リストから既存の System User (例: `my-system-user`) を選択 → そのまま Step 5 へ

#### 新規作成する場合

「+ 追加する」ボタンをクリック → ダイアログ:

| 項目 | 入力 |
|---|---|
| System user name | `meta-ads-mcp` 等 (識別用) |
| System user role | **「Employee」** か **「Admin」** (Admin の方が広い権限) |

→ 「Create system user」

### 4.3 System User の ID をメモ

URL や画面に ID が表示される (2 種類ある):
- BM User ID: `<YOUR_BM_USER_ID>` (Business Manager 内の数値 ID)
- App User ID: token に乗ってる別 ID (`<YOUR_APP_USER_ID>`) → これは debug_token で確認可

---

## Step 5: System User にアセット紐付け

これが最重要かつハマりやすい。**3 種類のアセットを全部紐付ける**:

### 5.1 広告アカウント紐付け

System User の詳細画面 (右パネル):

1. 「割り当てられたアセット」タブ
2. 「+ 追加する」ボタン (右上の青いやつ)
3. ダイアログで **アセット種別 = 「広告アカウント」** を選択
4. リストから **自社の広告アカウント** (例: `<YOUR_AD_ACCOUNT_ID>`) を選択
5. 権限: **「全権限」** (or「広告の管理」)
6. 「アクセス権を保存」

### 5.2 App 紐付け

同じ手順で:
1. 「+ 追加する」 → アセット種別 = **「アプリ」**
2. リストから **Step 1 で作った App (`mcp`)** を選択
3. 権限: **「全権限」(管理者)**
4. 保存

### 5.3 Facebook ページ紐付け ⚠️ 一番忘れがち

**この紐付けが無いと `(#3)` エラーで一日溶ける**。creative は Page を経由して投稿される仕組みなので必須。

#### 方法 A: System User 側から追加 (推奨)

1. System User 画面で「+ 追加する」 → アセット種別 = **「ページ」**
2. リストから **配信に使う Facebook ページ** (`<YOUR_PAGE_ID>` 等) を選択
3. 権限: **「フルコントロール」** (or 最低限「ページの管理」「コンテンツの作成・公開」「広告作成」3 つ ON)
4. 保存

#### 方法 B: ページ側から System User を割り当て

Business Manager → アカウント → ページ → **配信に使う** ページを選択 → 「ユーザーを割り当てる」ボタン → System User 名で検索 → 全権限で割り当て

### 5.4 確認: アセットが全部入ったか

System User 画面の「割り当てられたアセット」タブで:
- ✅ 広告アカウント: 自社の広告アカウント
- ✅ アプリ: mcp (Step 1 で作ったもの)
- ✅ ページ: 配信に使う Facebook ページ
- ✅ ピクセル: (オプション、CAPI 用なら追加)

ヘッダの件数が **4 件以上** になってればOK (3 件以下だとページ紐付け抜けてる)。

---

## Step 6: System User Token 生成

### 6.1 トークン生成ダイアログ

System User 画面右上 **「トークンを生成」** ボタン:

| 項目 | 選択 |
|---|---|
| アプリ | **Step 1 で作った `mcp`** を選択 ⚠️ |
| 有効期限 | **60日** (推奨) または「無期限」 |
| アクセス許可 | 下記 6 つを全部チェック |

### 6.2 必須 scope (6 つ)

| Scope | 用途 |
|---|---|
| `ads_management` | 広告作成・更新 |
| `ads_read` | insights 読み取り |
| `business_management` | Business Manager API |
| `pages_manage_ads` | ⭐ creative 作成に必須 |
| `pages_read_engagement` | Page insights |
| `pages_show_list` | 配信可能ページ一覧 |

#### 罠: 後から permission 追加 → token 再生成必要

Step 2 で App 側に permission を追加しても、既存 token には scope が乗らない。**permission 追加・変更したら必ず token 再生成**。

### 6.3 トークン文字列をコピー

`EAA...` で始まる長い文字列 (例: 200-300 文字)。

⚠️ **このトークン = 広告アカウント全権限**。漏れたら全広告乗っ取り可能なので 1Password 等に保存。

### 6.4 動作確認

```bash
TOKEN="EAA..."
# Token の検証
curl -s "https://graph.facebook.com/v24.0/debug_token?input_token=${TOKEN}&access_token=${TOKEN}" | python3 -m json.tool
```

期待する出力:
```json
{
  "data": {
    "app_id": "<YOUR_APP_ID>",
    "type": "SYSTEM_USER",
    "application": "mcp",
    "is_valid": true,
    "scopes": ["ads_management", "ads_read", ...]
  }
}
```

```bash
# Page アクセス確認 (これが空なら 5.3 のページ紐付け抜けてる)
curl -s "https://graph.facebook.com/v24.0/me/accounts?access_token=${TOKEN}" | python3 -m json.tool
```

期待: 配信に使うページが `data` 配列に出てくる、`tasks` に `ADVERTISE` `CREATE_CONTENT` `MANAGE` 等が含まれる。

---

## Step 7: MCP サーバー側に登録

リポジトリ直下に `.env.local` を作成 (`.env.example` をコピーして埋める / gitignored):

```bash
META_SYSTEM_USER_TOKEN=EAA...(Step 6.3 でコピーしたトークン)
META_DEFAULT_ACCOUNT_ID=<YOUR_AD_ACCOUNT_ID>
META_GRAPH_API_VERSION=v24.0
```

これで MCP から API を叩ける状態。次は [02-mcp-server-setup.md](./02-mcp-server-setup.md) へ。

---

## Token Refresh 運用 (60日ごと)

### 期限が近づいたら

1. <https://business.facebook.com/settings/system-users> へ
2. 該当 System User 選択
3. 「トークンを生成」で同じ条件で再発行
4. 新 token を `.env.local` の `META_SYSTEM_USER_TOKEN=` に更新
5. (もし他のツールが同じ App + System User を使ってるなら) そちらの `.env` も同期更新
6. Claude Code 再起動 (MCP プロセス再起動で新 token 読み直し)

### 期限切れの兆候

- `(#190) Error validating access token: The session has been invalidated...`
- `(#100) The access token could not be decrypted`

→ 即 refresh して .env.local 更新

### Token 期限の確認方法

```bash
TOKEN=$(grep META_SYSTEM_USER_TOKEN .env.local | cut -d= -f2)
curl -s "https://graph.facebook.com/v24.0/debug_token?input_token=${TOKEN}&access_token=${TOKEN}" | python3 -c "
import json, sys, datetime
d = json.load(sys.stdin)['data']
exp = d['expires_at']
print(f\"Expires at: {datetime.datetime.fromtimestamp(exp)}\")
print(f\"Days remaining: {(exp - datetime.datetime.now().timestamp()) / 86400:.1f}\")
"
```

---

## トラブルシューティング (要点)

詳細は [04-troubleshooting.md](./04-troubleshooting.md) 参照。

| 症状 | 主な原因 | 対処 |
|---|---|---|
| `(#3) Application does not have the capability` (creative 作成時) | App が未公開 / `pages_manage_ads` 抜け / Page アセット未紐付け | Step 3 + 2.2 + 5.3 全部確認 |
| `(#190) The session has been invalidated` | Token 期限切れ | Step 6 で再発行 |
| `(#200) Unpublished posts must be posted to a page as the page itself` | System User Token で feed 投稿しようとした | Page Access Token 経由にする (または asset_feed_spec で creative 作成して回避) |
| `(#10) requires pages_read_engagement permission` | Page アセット未紐付け | Step 5.3 |
| `/me/accounts` が `data: []` | Page アセット未紐付け | Step 5.3 |
| 新 permission 追加したのに使えない | Token 再生成してない | Step 6 で再発行 |

---

## 関連ドキュメント

- [02-mcp-server-setup.md](./02-mcp-server-setup.md) — MCP サーバーのインストール
- [03-architecture.md](./03-architecture.md) — MCP の中身 (26 tools)
- [04-troubleshooting.md](./04-troubleshooting.md) — エラー対処の経緯
- [05-publishable-knowledge.md](./05-publishable-knowledge.md) — 外部発信用のナレッジ
