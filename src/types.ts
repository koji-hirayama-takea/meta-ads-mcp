// Meta Graph API response types (only the fields we actually surface).
// Full schema: https://developers.facebook.com/docs/marketing-api/reference

export type Campaign = {
  id: string;
  name: string;
  status: "ACTIVE" | "PAUSED" | "DELETED" | "ARCHIVED";
  effective_status?: string;
  objective?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  bid_strategy?: string;
  start_time?: string;
  stop_time?: string;
  created_time?: string;
  updated_time?: string;
  special_ad_categories?: string[];
};

export type Adset = {
  id: string;
  name: string;
  campaign_id: string;
  status: "ACTIVE" | "PAUSED" | "DELETED" | "ARCHIVED";
  effective_status?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  optimization_goal?: string;
  billing_event?: string;
  bid_amount?: string;
  targeting?: Record<string, unknown>;
  promoted_object?: Record<string, unknown>;
  start_time?: string;
  end_time?: string;
};

export type Ad = {
  id: string;
  name: string;
  adset_id: string;
  campaign_id: string;
  status: "ACTIVE" | "PAUSED" | "DELETED" | "ARCHIVED";
  effective_status?: string;
  creative?: { id: string };
  conversion_domain?: string;
  created_time?: string;
  updated_time?: string;
};

export type AdCreative = {
  id: string;
  name?: string;
  object_story_spec?: Record<string, unknown>;
  asset_feed_spec?: Record<string, unknown>;
  call_to_action_type?: string;
  effective_object_story_id?: string;
  image_hash?: string;
  image_url?: string;
  thumbnail_url?: string;
  url_tags?: string;
};

export type Insights = {
  date_start: string;
  date_stop: string;
  impressions?: string;
  reach?: string;
  spend?: string;
  cpm?: string;
  cpc?: string;
  ctr?: string;
  frequency?: string;
  clicks?: string;
  actions?: Array<{ action_type: string; value: string }>;
  action_values?: Array<{ action_type: string; value: string }>;
  cost_per_action_type?: Array<{ action_type: string; value: string }>;
};

export type AdImage = {
  hash: string;
  url?: string;
  width?: number;
  height?: number;
};

export type PaginationCursors = {
  before?: string;
  after?: string;
};

export type GraphListResponse<T> = {
  data: T[];
  paging?: {
    cursors?: PaginationCursors;
    next?: string;
    previous?: string;
  };
};

export type GraphErrorPayload = {
  error: {
    message: string;
    type: string;
    code: number;
    error_subcode?: number;
    error_user_title?: string;
    error_user_msg?: string;
    fbtrace_id?: string;
  };
};

// 既知の Meta API エラー subcode → 日本語の意味と推奨対処
// 5/29〜6/1 の試行錯誤で実際に踏んだやつを優先網羅
export const ERROR_HINTS: Record<number, { title: string; hint: string }> = {
  1885559: {
    title: "attribution_spec と optimization_goal の不整合",
    hint:
      "optimization_goal によって attribution window 制約が違う (LINK_CLICKS=1d / OFFSITE_CONVERSIONS=7d 等)。新 adset を正しい組合せで作り直し。",
  },
  1504040: {
    title: "attribution_spec は post-creation 編集不可",
    hint:
      "Meta 2026 仕様変更で adset 作成後の attribution_spec 変更不可。新 adset 作成し直し。",
  },
  3260011: {
    title: "公開済 adset の編集制限",
    hint:
      "pixel / conversion event / custom conversion / optimization_goal は公開後変更不可。新 adset 作成。",
  },
  1885553: {
    title: "Dynamic Creative adset には 1 active ad のみ可",
    hint:
      "DC adset の Meta ルール。ad ごとに別 adset 作るか、creative を link_data 形式 (=non-DC adset) に変える。",
  },
  1885998: {
    title: "non-DC adset に DC creative を attach できない",
    hint:
      "creative 形式と adset の DC フラグを一致させる。DC creative は is_dynamic_creative=true の adset 作って attach。",
  },
  1885852: {
    title: "DC adset に link_data creative を attach できない",
    hint:
      "DC adset には asset_feed_spec creative のみ可。link_data 使うなら新 non-DC adset を作る。",
  },
  1885183: {
    title: "App が Development mode なので creative 作成不可",
    hint:
      "App を Live mode に切替 (publish ボタン) するか、asset_feed_spec creative で workaround。Pipeboard 経由が確実。",
  },
  1487566: {
    title: "削除済キャンペーンは編集不可 (名前のみ可)",
    hint:
      "DELETE で soft delete された entity は復活不可。新規作成するか、UI フィルタで削除済表示。",
  },
  2446496: {
    title: "アップロードファイル不正",
    hint: "upload_ad_image で画像形式 / サイズが Meta 要件外。1080x1080 PNG/JPG を推奨。",
  },
};

export class GraphApiError extends Error {
  constructor(
    message: string,
    public readonly code: number,
    public readonly type: string,
    public readonly fbtrace_id?: string,
    public readonly subcode?: number,
    public readonly userTitle?: string,
    public readonly userMsg?: string,
  ) {
    const hint = subcode ? ERROR_HINTS[subcode] : undefined;
    const enriched = hint
      ? `${message}\n[diagnosis] ${hint.title}\n[hint] ${hint.hint}`
      : code === 3
        ? `${message}\n[diagnosis] App capability 不足 (App Review or 別形式 creative で回避)\n[hint] docs/04-troubleshooting.md の #3 セクション参照`
        : message;
    super(enriched);
    this.name = "GraphApiError";
  }
}
