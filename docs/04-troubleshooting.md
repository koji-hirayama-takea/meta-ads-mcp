---
title: トラブルシューティング集
status: canonical
last_updated: 2026-06-01
context: 2026-05-29〜2026-06-01 の試行錯誤 4 日間の全記録
---

# トラブルシューティング集

実際にハマったエラー全部と、解決までの経緯を時系列で残す。同じ罠にハマった人 (将来の自分含む) が即解決できるように。

---

## 全体像: 2026-05-29〜2026-06-01 の 4 日間にハマった順序

```
[Day 1: 2026-05-29] 自作 MCP 構築
1. Pipeboard MCP の Free 枠 (週30 req) 使い切り → "weekly limit reached"
2. 自作 MCP 構築 (20 tools) → Token は別アプリの System User Token を流用
3. POST /act_xxx/adcreatives で (#3) capability エラー
4. 新 App `mcp` 作成 + Live mode 化 + Page アセット紐付け → それでも (#3) 続く
5. 徹底再調査で asset_feed_spec (Dynamic Creative) 経路発見 → creative 作成成功
6. LP-2 4 ads + LP-1 3 ads の UTM 仕込み完了

[Day 2-4: 2026-05-30 〜 06-01] 配信ゼロ → 真の原因判明
7. 配信 ¥0 が 3 日継続 (5/27-29 は ¥2-3k/日 だったのに突然停止)
8. 各種試行: optimization 変更 / Page Access Token / 旧 creative ロールバック
   全部 Meta 仕様で不可と判明
9. 真の原因判明: asset_feed_spec 差し替えで adset が `is_dynamic_creative=true` に自動 flip
   → 「1 active ad per Dynamic Creative adset」ルール抵触 → 配信停止
10. v2 TRAFFIC + 7 DC adsets で配信再開試行 (1 adset 1 ad の不格好な構造)
11. Pipeboard クォータ復活 (week-over-week reset) → link_data creative 7 件作成
12. v3 LEADS 構造: 1 adset / N ads の元構造完全復元 + UTM 完全保持 ✅

[最終]
- 自作 MCP: read / update / delete / 既存 creative 流用 全部可
- Pipeboard MCP: 新 link_data creative 作成 (App Review 通過済の利点)
- → ハイブリッド運用が最適解
```

---

## エラー集

### ❌ `Pipeboard: You've used all your trial commands and reached the weekly limit on your Free plan`

#### 状況
Pipeboard MCP (`meta-ads`) で週30 req のクォータ使い切り。

#### 解決
2 択:
- **Pipeboard Pro $25/月** にアップグレード
- **自作 MCP に切替** ← 採用 (時間さえあれば数時間で構築可能、課金不要)

#### 教訓
1 SaaS に握られると突然動かなくなる。重要な運用 MCP は自社管理に倒す方が安心。

---

### ❌ `(#3) Application does not have the capability to make this API call`

最も時間を溶かしたエラー。**POST /act_xxx/adcreatives 限定** で発生。

#### 切り分け

| 同じ Token で叩いた endpoint | 結果 |
|---|---|
| `GET /` 系全部 | ✅ 通る |
| `POST /<ad_id>` (status 変更等) | ✅ 通る |
| `POST /act_xxx/ads` (新規 ad、creative_id 既存参照) | ✅ 通る |
| `POST /act_xxx/adimages` (画像 upload) | ✅ 通る |
| **`POST /act_xxx/adcreatives` (新規 creative 作成)** | **❌ #3** |

→ creative 作成 endpoint **だけ** が App-level capability check で弾かれてる。

#### 試したけど効かなかった対処

1. ❌ **System User Token を再発行** → 同じエラー
2. ❌ **新 Meta App `mcp` を新規作成して別 Token で試す** → 同じエラー
3. ❌ **App を Live mode (公開) に切替** → 同じエラー
4. ❌ **API バージョンを v22.0 / v20.0 にダウングレード** → 同じエラー
5. ❌ **古い別 App の Token で試す** → 同じエラー
6. ❌ **Page Access Token で叩く** → 同じエラー (Page Token は別の場面で必要だがここでは効果なし)
7. ❌ **既存 creative の `url_tags` を update** → Meta が `name/status/adlabels のみ更新可` と返却 (creatives は immutable)
8. ❌ **既存 creative を `/copies` で複製** → endpoint 存在せずエラー

#### 効いた対処 ✅ : `asset_feed_spec` 経路に切替

**原因**: `object_story_spec.link_data` で creative を作る = 内部的に「unpublished Page post を生成する」操作 → `pages_manage_posts` capability check が走る → App が未公開モード or `pages_manage_posts` permission 不足だと弾かれる。

**回避策**: `asset_feed_spec` (Meta の Dynamic Creative 形式) で作る = Page post を作らず account-scoped storage に保存 → `ads_management` のみで通る。

```bash
# 旧 (拒否):
curl -X POST "https://graph.facebook.com/v24.0/act_xxx/adcreatives" \
  --data-urlencode "object_story_spec={\"page_id\":\"...\",\"link_data\":{\"link\":\"...\",\"message\":\"...\",...}}" \
  -d "access_token=..."
# → (#3) Application does not have the capability

# 新 (通る) ✅:
curl -X POST "https://graph.facebook.com/v24.0/act_xxx/adcreatives" \
  --data-urlencode "object_story_spec={\"page_id\":\"...\"}" \
  --data-urlencode "asset_feed_spec={\"images\":[{\"hash\":\"...\"}],\"bodies\":[{\"text\":\"...\"}],\"titles\":[{\"text\":\"...\"}],\"link_urls\":[{\"website_url\":\"...\"}],\"call_to_action_types\":[\"SIGN_UP\"],\"ad_formats\":[\"SINGLE_IMAGE\"]}" \
  -d "access_token=..."
# → {"id": "873380605783888"} ✅
```

#### 教訓

- Meta API のエラーコードは大雑把 (`#3` だけだと原因不明)
- 「creative 作成」と一括りに見えて実は **複数の内部経路** がある (link_data 経路 / asset_feed_spec 経路 / object_story_id 経路)
- 経路ごとに権限要件が違う → 1 つ詰まったら別経路を試す価値あり

---

### ❌ `(#200) Unpublished posts must be posted to a page as the page itself`

#### 状況
asset_feed_spec への切替を試す前に、別の workaround として「先に Page に unpublished post を作る → その post_id を creative の object_story_id として渡す」を試した時に発生。

```bash
curl -X POST "https://graph.facebook.com/v24.0/${PAGE_ID}/feed" \
  -F "message=test" \
  -F "link=https://example.com/" \
  -F "published=false" \
  -F "access_token=${SYSTEM_USER_TOKEN}"
# → (#200) Unpublished posts must be posted to a page as the page itself.
```

#### 原因

`/{page-id}/feed` POST は **Page Access Token** で叩く必要がある (System User Token じゃダメ)。

#### 対処

Page Access Token を取得:

```bash
PAGE_TOKEN=$(curl -s "https://graph.facebook.com/v24.0/${PAGE_ID}?fields=access_token&access_token=${SYSTEM_USER_TOKEN}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))")

# Page Token で feed 投稿
curl -X POST "https://graph.facebook.com/v24.0/${PAGE_ID}/feed" \
  -F "message=test" -F "published=false" \
  -F "access_token=${PAGE_TOKEN}"
```

しかし結局 Page feed POST には `pages_manage_posts` permission が必要で、それが無いと「pages_manage_posts permission required」エラーになる。

#### 結論

この経路 (Page feed → object_story_id → creative 作成) は `pages_manage_posts` permission が必要なので、最終的に **asset_feed_spec 経路 (Page post 不要)** の方がシンプルで採用。

---

### ❌ `(#10) requires pages_read_engagement permission or 'Page Public Content Access'`

#### 状況
`GET /<page_id>` で Page 情報を取りに行ったら拒否される。

#### 原因
- Token の scope に `pages_read_engagement` が無い → Token 再発行で追加
- OR System User に Page アセットが紐付いてない → Business Manager で紐付け

#### 確認方法
```bash
# /me/accounts が空配列なら Page 未紐付け
curl -s "https://graph.facebook.com/v24.0/me/accounts?access_token=${TOKEN}" | python3 -m json.tool
```

#### 対処
1. Business Manager → System Users → 該当ユーザー → 「+ 追加する」 → ページ → 配信に使うページを **フルコントロール** で紐付け
2. Token 再発行 (scope に `pages_read_engagement` を含める)

---

### ❌ `(#100) Tried accessing nonexisting field (ads)`

#### 状況
最初 Pipeboard MCP で `get_ads` を `act_xxx` (account レベル) で呼んだ時に発生。

#### 原因
`act_<account_id>/ads` という endpoint は存在しない。`<adset_id>/ads` か `<campaign_id>/ads` で叩く必要がある。Pipeboard の wrapper が古かった可能性。

#### 対処
自作 MCP では `account_id` 指定時は `<campaign_id>/ads` をループする方針に。

---

### ❌ `(#190) The session has been invalidated`

#### 状況
Token 期限切れ。System User Token は 60日有効。

#### 対処
01-meta-app-setup.md の Step 6 で再発行 → `.env.local` を更新 → Claude Code 再起動。

---

### ❌ `META_SYSTEM_USER_TOKEN missing`

#### 状況
MCP server 起動時に即エラー。

#### 原因
- `.env.local` 配置忘れ
- `.env.example` を `.env` (.local なし) にコピーしてしまった
- 環境変数読み込みの hoisting 問題

#### 対処
1. `.env.local` が `meta-ads-mcp/` 直下にあるか確認
2. ファイル中身 `META_SYSTEM_USER_TOKEN=EAA...` が正しく書かれてるか
3. dotenv の lazy 読み込み実装になってるか (graph-client.ts が `function token() { return process.env.X }` 形式)

---

### ❌ `Invalid parameter (subcode 2490433)`

#### 状況
asset_feed_spec を最初に試した時、ad_format が不適切で発生。

#### 対処
`ad_formats: ["SINGLE_IMAGE"]` を正しく指定 + 全必須フィールド (images / bodies / titles / link_urls / call_to_action_types) を埋める。

---

### ⚠️ `effective_status: PENDING_REVIEW` (LP-1 で発生)

#### 状況
ACTIVE 配信中の LP-1 ad に creative_id を新規 ID に差し替えた直後、Meta の自動審査で一時停止状態に。

#### 対処
**待つ**。通常 30 分 〜 数時間で `ACTIVE` に復帰。

審査中は配信が一時止まるので機会損失あり。深夜帯にやれば実害ほぼなし。

#### 教訓
ACTIVE 広告への creative 差し替えはタイミング選ぶべし。配信ピーク時間帯は避ける。

---

### ❌❌❌ 配信ゼロが 3 日続く: `is_dynamic_creative=true` 自動 flip の罠 (2026-05-30〜06-01)

これが今回最大の落とし穴。**asset_feed_spec workaround の副作用** で adset の構造が壊れて配信停止した。

#### 状況
5/27-29 は ¥2-3k/日 で順調配信 → 5/30 突然 ¥0 → 5/31, 6/1 も ¥0 継続。
全 ads `effective_status=ACTIVE`、issues_info 警告なし、残高あり。なのに配信されない。

#### 表面的に確認したが原因ではなかった項目
| 確認した項目 | 結果 |
|---|---|
| Account 残高 | ¥9,156 残ってる ✅ |
| account_status | 1 (ACTIVE) ✅ |
| disable_reason | 0 ✅ |
| campaign / adset / ad の effective_status | 全部 ACTIVE ✅ |
| issues_info | 空 (警告なし) ✅ |
| recommendations | 別件 (CRM 連携の話) で配信停止と無関係 |

#### 真の原因
**5/29 に creative を `object_story_spec.link_data` → `asset_feed_spec` に差し替えた瞬間、Meta が adset の `is_dynamic_creative` を自動で `true` に flip** していた。

Dynamic Creative adset の Meta 仕様:
- **「1 active ad per adset only」** が原則 (DC は 1 ad 内で 5x5x5 のアセット組合せをテストする format、複数 ad 同居は設計外)
- 旧 adset には 4 ads (LP-2) / 3 ads (LP-1) が同居していた → ルール抵触
- → Meta が「配信不可状態」と判定して spend を絞った

#### 発見の決め手
- `GET /<adset_id>?fields=is_dynamic_creative` で `true` 返却
- 過去ジャーナルで「5/29 までは link_data + 1 adset 4 ads で動いてた」事実確認

#### 解決策
**最終的に v3 LEADS 構造で再構築 (元の 1 adset / N ads + link_data creative + utm)**:
1. Pipeboard MCP のクォータ復活を確認 (月曜 quota reset)
2. Pipeboard で link_data creative 7 件作成 (utm 込)
3. 新 non-DC adset 2 つ (LP-1 + LP-2) を OFFSITE_CONVERSIONS + CR で作成
4. 既存 link_data creative_id を `creative.creative_id` で参照する形で ad 作成
5. 古い DC adsets + 元 campaigns 全部削除

#### 教訓
1. **asset_feed_spec creative を既存 adset に attach すると adset が DC 化する** (元に戻せない)
2. **DC adset は 1 active ad only**。複数 ad 同居しても配信されない
3. **trade-off**: asset_feed_spec は #3 capability error 回避できるが DC 化リスクあり → 緊急時のみ。link_data + Pipeboard が正解
4. **真の cold start 問題ではなかった**: CompleteRegistration 1件/週 は元々の話で、5/27-29 は普通に配信できていた

---

### ❌ `(#100) error_subcode 1885559: アトリビューションウィンドウが新しい最適化の目的では使用できない`

#### 状況
既存 adset の `optimization_goal` を OFFSITE_CONVERSIONS → LINK_CLICKS に変更しようとして発生。

#### 原因
optimization_goal によって許容される `attribution_spec` (CLICK_THROUGH window_days) が違う:
- OFFSITE_CONVERSIONS: 1d / 7d 両方 OK
- LINK_CLICKS: 1d 必須
- 既存 adset の attribution_spec=7d で LINK_CLICKS に変えようとすると非互換エラー

#### 罠
**attribution_spec は post-creation で更新不可** (#1504040「アトリビューションウィンドウの更新はサポートされなくなりました」)。Meta が 2026 年に仕様変更。

#### 解決
**新 adset を作成し直す** (attribution_spec を最初から正しい値で指定)。既存 adset を編集で救う道はない。

---

### ❌ `(#100) error_subcode 3260011: 公開済みの広告セットを編集することはできません`

#### 状況
既存 adset の `promoted_object.custom_event_type` を COMPLETE_REGISTRATION → LEAD に変えようとして発生。

#### 原因
Meta は 2026 年仕様変更で、**公開済 (一度でも ACTIVE / IN_PROCESS になった) adset の以下フィールドを編集不可** にした:
- pixel
- conversion event (custom_event_type)
- custom conversion
- 広告セットの最適化 (optimization_goal)

編集できるのは: budget / bid / targeting / name / schedule / status。

#### 解決
**新 adset を作成し直す**。「Meta は最適化を間違えたら新規作り直し」が前提設計に変わった。

#### 教訓
最適化設定は **作成時に確定**。後から変えられないので、慎重に決める。

---

### ❌ `(#100) error_subcode 1885553: ダイナミッククリエイティブ広告セットには複数の広告を含めることができません`

#### 状況
DC adset に 2 個目以降の ad を `/copies` で複製、または `create_ad` で追加しようとして発生。

#### 原因
**「1 active ad per DC adset」ルール** の強制。Meta が API レベルで弾く。

#### 解決
DC ads を運用したい場合:
- **1 ad ごとに 1 adset 作る** (4 ads なら 4 adset、Meta の budget auto-distribute を諦める)
- もしくは **link_data 形式に変えて non-DC adset で運用** (1 adset / N ads が成立)

---

### ❌ `(#100) error_subcode 1885998: 非ダイナミッククリエイティブ広告セットでダイナミッククリエイティブ広告を作成することはできません`

#### 状況
non-DC adset (普通の adset) に asset_feed_spec creative を持つ ad を `create_ad` で追加しようとして発生。

#### 原因
creative の形式と adset の DC フラグが整合してないと attach 不可:

| Creative 形式 | Adset is_dynamic_creative=false (non-DC) | Adset is_dynamic_creative=true (DC) |
|---|---|---|
| **link_data** (`object_story_spec.link_data`) | ✅ attach 可 | ❌ "DC 添付ファイルがありません" |
| **asset_feed_spec** (Dynamic Creative) | ❌ 本エラー | ✅ attach 可 (ただし 1 ad only) |

#### 解決
- **link_data creative**: non-DC adset に attach (1 adset / N ads OK)
- **asset_feed_spec creative**: 新規 DC adset 作成時に `is_dynamic_creative=true` を明示指定して、1 ad だけ attach

---

### ❌ `update_ad` で `adset_id` を変更しても無視される

#### 状況
ad を別の adset に移動したくて `POST /<ad_id>` に `adset_id=新ID` を送ったら `success: true` だが、実際は移動されてない。

#### 原因
**Meta は ad の adset 間移動を直接サポートしてない**。`adset_id` を update_ad に渡すと黙って無視される (エラーすら出ない静かな失敗)。

#### 解決
- `POST /<ad_id>/copies` の `target_adset_id` で複製 (旧 ad は別途 PAUSED か DELETE)
- OR `POST /act_xxx/ads` で creative_id を流用して新 adset に新規 ad 作成

---

### ❌ Pipeboard クォータ復活タイミング

#### 状況
2026-05-29 (金) に Free 枠 (週 30 req) を使い切り → 5/30, 5/31 と Pipeboard 経由叩けず。

#### 復活タイミング
**月曜 (週初め) リセット** が経験則。6/1 (月) に試したら正常動作。

#### 教訓
Pipeboard Free 枠は週 30 req と少ないが、creative 作成 (1 件あたり 1 req) なら 30 件分は無料で作れる。**creative 作成だけ Pipeboard、運用は自作 MCP** のハイブリッドが最強。

詳細: [`06-pipeboard-hybrid.md`](./06-pipeboard-hybrid.md)

---

## 効かなかった神話 (旧理解 vs 実態)

### 神話 1 (一部訂正): "asset_feed_spec で App Review 回避できる"

**5/29 時点の理解**: asset_feed_spec workaround で App Review なしで creative 作成可能 → **当面は OK だが副作用あり**

**6/1 時点の修正**: asset_feed_spec creative を attach すると **adset が自動 DC 化** し、「1 active ad per adset」ルールで配信停止。配信止まる罠は事前に知らないとハマる。

正しい結論:
- **link_data creative + non-DC adset** が「本来の」正しい構造 (1 adset / N ads)
- それを作るには **Pipeboard 経由 (App Review 通過済の App)** か **App Review 自分で通す**
- asset_feed_spec は「creative を一時的に作るだけの workaround」、本格運用には向かない

### 神話 2: "ライブモードにすると誰でも使える"

✅ 変わらず False。Live mode は API 解放スイッチ、App secret / System User Token 持ってる人しか叩けない。

### 神話 3 (一部訂正): "自社運用なら asset_feed_spec で十分"

**5/29 時点**: 自社アカウント運用なら asset_feed_spec で十分 → **6/1 で配信停止して破綻** → 修正

**6/1 修正**: 自社運用 + 1 adset / N ads 構造維持には **link_data creative が必須**。Pipeboard 借りるか自分の App を Review 通すしかない。

### 神話 4: "creative update で url_tags 書き換えれば差し替え不要"

✅ 変わらず False。creative は **immutable**。`name / status / adlabels` のみ更新可。URL や url_tags 変えるには **新 creative 作成 + ad 差し替え**。

### 神話 5 (新規): "Meta は同 adset の最適化変更を許す"

**6/1 判明**: Meta は 2026 年に仕様変更し、**公開済 adset の以下フィールドを編集不可** にした:
- pixel / conversion event / custom conversion / optimization_goal / attribution_spec

「作成時に確定、変更したければ新規」が新原則。

### 神話 6 (新規): "ad は adset 間を移動できる"

False。`update_ad` で `adset_id` を変えても **無視される (エラーすら出ない)**。移動したければ `/copies` で target_adset_id 指定 + 旧 ad を PAUSED/DELETE。

### 神話 7 (新規): "DC adset と non-DC adset は creative を共有できる"

False。creative と adset の DC フラグは **形式互換性ルール**で縛られる:

| creative 形式 | non-DC adset | DC adset |
|---|---|---|
| link_data | ✅ | ❌ |
| asset_feed_spec | ❌ | ✅ |

混在不可。creative 形式を決めると adset の選択肢が決まる。

---

## 次に詰まりそうなところ (予防保守)

### 🚨 creative 形式の選択は慎重に (=最重要)

5/29-6/1 で学んだ最大の教訓:

| 用途 | creative 形式 | adset 形式 |
|---|---|---|
| **1 adset で複数 ads 同居 (A/B テスト、推奨運用)** | link_data | non-DC |
| **1 ad で複数アセット組合せテスト (DC 本来の用途)** | asset_feed_spec | DC (is_dynamic_creative=true) |
| **URL 差し替えだけしたい** | 元 link_data を Pipeboard で再生成 → ad 差し替え | 触らない |

**間違って asset_feed_spec creative を non-DC adset に attach すると adset が DC 化 + 元に戻せない**。

### Token refresh 忘れ

60 日で勝手に invalid 化する。カレンダーに refresh リマインダ入れるのが確実。

### Pipeboard クォータ管理

Free 枠 30 req/週。リセットは **月曜推定**。creative 作成 (1 件 1 req) なら週 30 件まで無料。
クォータが切れたら 1 週間動かない → 月曜まで待つか Pro $25/月。
詳細・ハイブリッド使い分け: [`06-pipeboard-hybrid.md`](./06-pipeboard-hybrid.md)

### API バージョン deprecation

Meta は年に 1-2 回 API バージョンを deprecate する。`v24.0` がいつまで使えるかは <https://developers.facebook.com/docs/graph-api/changelog> で確認。

### Page を別 Business Manager に移管したら

System User の Page アセット紐付けが切れる → 即 #3 系エラー。Page 移管時は必ず System User 側で紐付け直す。

### App を別 Business Manager に移管したら

同様に System User の App アセット紐付けが切れる。Token も別 App 扱いで失効するので新規発行必要。

### Meta UI の「推奨事項」を鵜呑みにしない

Ads Manager UI の「推奨事項」は **配信停止の原因と無関係** なケースが多い (一般的なマーケティングアドバイス)。  
6/1 の例: 「CRM を Meta にリンク」が出てたが、配信停止の真因は別 (is_dynamic_creative flip)。  
推奨事項は **長期最適化のヒント** として読む、緊急対処の根拠にはしない。

### 配信ゼロ時の切り分け順序

将来同じ事案にハマったら以下の順で切り分け:

1. `effective_status` 全レベル (account / campaign / adset / ad) → 1 つでも非 ACTIVE なら原因
2. `issues_info` → Meta が出す警告メッセージ
3. `balance` / `account_status` / `disable_reason` → 支払い系問題
4. **`is_dynamic_creative` フラグ** (adset レベル) → DC 化 + 1 ad ルール違反確認
5. `time_range` で過去 N 日比較 → いつから止まったか特定 → 直前の変更を疑う
6. `recommendations` → Meta の汎用提案、参考程度

---

## 関連ドキュメント

- [01-meta-app-setup.md](./01-meta-app-setup.md) — Meta 側発行作業
- [02-mcp-server-setup.md](./02-mcp-server-setup.md) — MCP インストール
- [03-architecture.md](./03-architecture.md) — MCP の中身
- [05-publishable-knowledge.md](./05-publishable-knowledge.md) — 外部発信用ナレッジ
- [06-pipeboard-hybrid.md](./06-pipeboard-hybrid.md) — Pipeboard と自作 MCP のハイブリッド運用
