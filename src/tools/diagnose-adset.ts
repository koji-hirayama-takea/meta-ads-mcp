import { z } from "zod";
import { fieldsParam, graphGet } from "../graph-client.js";

export const diagnoseAdsetSchema = z.object({
  adset_id: z.string(),
  days: z.number().int().min(1).max(30).default(7).describe("直近 N 日の spend / impressions を取得"),
});

type AdsetDetail = {
  id: string;
  name: string;
  status: string;
  effective_status: string;
  configured_status: string;
  optimization_goal: string;
  billing_event: string;
  is_dynamic_creative?: boolean;
  attribution_spec?: Array<{ event_type: string; window_days: number }>;
  promoted_object?: Record<string, unknown>;
  daily_budget?: string;
  lifetime_budget?: string;
  start_time?: string;
  end_time?: string;
  issues_info?: unknown[];
  recommendations?: unknown[];
};

type AdInfo = { id: string; name: string; effective_status: string; creative?: { id: string } };

type Insights = {
  data: Array<{
    date_start: string;
    spend: string;
    impressions: string;
    clicks: string;
    actions?: Array<{ action_type: string; value: string }>;
  }>;
};

type Issue = { severity: "ERROR" | "WARN" | "INFO"; category: string; message: string; hint: string };

/**
 * Adset 単体ヘルスチェック。
 *
 * Checks:
 * - effective_status / configured_status mismatch
 * - is_dynamic_creative + 配下 ad 数 ルール (DC は 1 ad only)
 * - optimization_goal + attribution_spec の整合性
 * - promoted_object の CV event の発火頻度 (50/週閾値達成か)
 * - 直近 N 日 spend 推移 + 配信実績
 */
export async function diagnoseAdset(
  args: z.infer<typeof diagnoseAdsetSchema>,
): Promise<{
  adset: AdsetDetail;
  ads: { total: number; active: number; ad_ids: string[] };
  recent_metrics: {
    days: number;
    total_spend: number;
    total_impressions: number;
    total_clicks: number;
    cv_events: Record<string, number>;
  };
  issues: Issue[];
  summary: string;
}> {
  const adsetDetail = await graphGet<AdsetDetail>(args.adset_id, {
    fields: fieldsParam([
      "id",
      "name",
      "status",
      "effective_status",
      "configured_status",
      "optimization_goal",
      "billing_event",
      "is_dynamic_creative",
      "attribution_spec",
      "promoted_object",
      "daily_budget",
      "lifetime_budget",
      "start_time",
      "end_time",
      "issues_info",
      "recommendations",
    ]) ?? "",
  });

  const adsRes = await graphGet<{ data: AdInfo[] }>(`${args.adset_id}/ads`, {
    fields: fieldsParam(["id", "name", "effective_status", "creative"]) ?? "",
    limit: 50,
  });
  const ads = adsRes.data ?? [];
  const activeAds = ads.filter((a) => a.effective_status === "ACTIVE");

  // Recent metrics
  const since = new Date();
  since.setDate(since.getDate() - args.days);
  const untilStr = new Date().toISOString().slice(0, 10);
  const sinceStr = since.toISOString().slice(0, 10);
  const insights = await graphGet<Insights>(`${args.adset_id}/insights`, {
    fields: fieldsParam(["spend", "impressions", "clicks", "actions"]) ?? "",
    time_range: JSON.stringify({ since: sinceStr, until: untilStr }),
  });
  const stats = (insights.data ?? [])[0];
  const totalSpend = Number(stats?.spend ?? 0);
  const totalImp = Number(stats?.impressions ?? 0);
  const totalClk = Number(stats?.clicks ?? 0);
  const cvEvents: Record<string, number> = {};
  for (const a of stats?.actions ?? []) {
    cvEvents[a.action_type] = Number(a.value);
  }

  // Build issues
  const issues: Issue[] = [];

  // status mismatch
  if (adsetDetail.configured_status !== adsetDetail.effective_status) {
    issues.push({
      severity: "WARN",
      category: "status",
      message: `configured=${adsetDetail.configured_status} vs effective=${adsetDetail.effective_status}`,
      hint:
        "configured (ユーザー設定) と effective (Meta 判定) がズレている = 親 campaign が停止 / 審査中 / 残高不足等。effective が DISAPPROVED や PENDING_REVIEW なら原因対処。",
    });
  }

  // DC adset rule
  if (adsetDetail.is_dynamic_creative === true) {
    if (activeAds.length > 1) {
      issues.push({
        severity: "ERROR",
        category: "dynamic_creative",
        message: `DC adset に ACTIVE ads ${activeAds.length} 個 (1 のみ許可)`,
        hint:
          "Dynamic Creative adset は「1 active ad only」。余分な ads を PAUSE するか、creative を link_data 形式に変えて non-DC adset で運用。",
      });
    }
  }

  // Optimization-attribution mismatch
  const attribDays = adsetDetail.attribution_spec?.[0]?.window_days;
  if (adsetDetail.optimization_goal === "LINK_CLICKS" && attribDays !== 1) {
    issues.push({
      severity: "WARN",
      category: "attribution",
      message: `LINK_CLICKS なのに attribution window_days=${attribDays} (1 必須)`,
      hint:
        "Meta は post-creation の attribution_spec 編集不可。新 adset 作成し直しが必要。",
    });
  }

  // CV event threshold (50/week for OFFSITE_CONVERSIONS)
  if (
    adsetDetail.optimization_goal === "OFFSITE_CONVERSIONS" &&
    adsetDetail.promoted_object &&
    "custom_event_type" in adsetDetail.promoted_object
  ) {
    const ev = (adsetDetail.promoted_object as { custom_event_type: string }).custom_event_type.toLowerCase();
    const evCount = cvEvents[ev] ?? 0;
    if (args.days >= 7 && evCount < 50) {
      issues.push({
        severity: "WARN",
        category: "learning_phase",
        message: `${ev} ${args.days}日で ${evCount} 件 (週 50 件閾値未達)`,
        hint:
          "Meta 学習フェーズ離脱に週 50 CV 必要。閾値未達だと配信絞られる。bridge 戦略 (上流イベントで学習 → CR 移行) 検討。",
      });
    }
  }

  // Delivery check
  if (adsetDetail.effective_status === "ACTIVE" && totalSpend === 0 && args.days >= 1) {
    issues.push({
      severity: "ERROR",
      category: "delivery",
      message: `ACTIVE だが直近 ${args.days}日 spend ¥0`,
      hint:
        "配信ゼロ。DC adset 1-ad ルール / CV 閾値 / クリエ審査 / アカウント問題などを疑う。diagnose_delivery で account 全体も確認推奨。",
    });
  }

  // issues_info / recommendations
  if (adsetDetail.issues_info && (adsetDetail.issues_info as unknown[]).length > 0) {
    issues.push({
      severity: "WARN",
      category: "meta_issues",
      message: `Meta が ${(adsetDetail.issues_info as unknown[]).length} 件の issues 報告`,
      hint: "issues_info の中身を確認 → クリエ違反 / targeting 警告 / 残高 etc.",
    });
  }

  const summary =
    issues.filter((i) => i.severity === "ERROR").length > 0
      ? `🔴 ${issues.filter((i) => i.severity === "ERROR").length} 件の問題あり`
      : issues.filter((i) => i.severity === "WARN").length > 0
        ? `🟡 警告 ${issues.filter((i) => i.severity === "WARN").length} 件`
        : `✅ 異常なし (spend ¥${totalSpend} / ${args.days}日)`;

  return {
    adset: adsetDetail,
    ads: { total: ads.length, active: activeAds.length, ad_ids: ads.map((a) => a.id) },
    recent_metrics: {
      days: args.days,
      total_spend: totalSpend,
      total_impressions: totalImp,
      total_clicks: totalClk,
      cv_events: cvEvents,
    },
    issues,
    summary,
  };
}
