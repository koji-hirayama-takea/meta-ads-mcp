import { z } from "zod";
import { fieldsParam, graphGet, resolveAccountId } from "../graph-client.js";

export const diagnoseDeliverySchema = z.object({
  account_id: z.string().optional(),
  compare_days: z
    .number()
    .int()
    .min(1)
    .max(30)
    .default(7)
    .describe("Days of recent spend to compare (default 7 = last week vs this week pattern)."),
});

type AccountInfo = {
  name: string;
  account_status: number;
  disable_reason: number;
  balance: string;
  amount_spent: string;
  currency: string;
  spend_cap: string;
  timezone_name?: string;
};

type Insights = {
  data: Array<{ date_start: string; spend: string; impressions: string; clicks: string }>;
};

type DiagnosisIssue = {
  severity: "ERROR" | "WARN" | "INFO";
  category: string;
  message: string;
  hint: string;
};

/**
 * Account 全体の配信ヘルスチェック。配信ゼロ / 異常時の切り分け 6 ステップを 1 tool で実行。
 *
 * Steps:
 * 1. account_status / disable_reason (アカウント停止系)
 * 2. balance vs daily_budget (支払い枯渇予測)
 * 3. campaigns の effective_status 全部 ACTIVE か
 * 4. adset 全部 ACTIVE + DC フラグ整合性
 * 5. 直近 N 日 spend 推移 (どこから落ちたか)
 * 6. recommendations (Meta が出してる注意喚起)
 */
export async function diagnoseDelivery(
  args: z.infer<typeof diagnoseDeliverySchema>,
): Promise<{
  account: AccountInfo;
  recent_spend: Array<{ date: string; spend: number; impressions: number; clicks: number }>;
  active_campaigns: number;
  active_adsets: number;
  paused_or_archived_adsets: number;
  dynamic_creative_adsets: number;
  issues: DiagnosisIssue[];
  summary: string;
}> {
  const account = resolveAccountId(args.account_id);

  const accInfo = await graphGet<AccountInfo>(account, {
    fields: fieldsParam([
      "name",
      "account_status",
      "disable_reason",
      "balance",
      "amount_spent",
      "currency",
      "spend_cap",
      "timezone_name",
    ]) ?? "",
  });

  // Recent spend trend
  const since = new Date();
  since.setDate(since.getDate() - args.compare_days);
  const untilDate = new Date();
  const sinceStr = since.toISOString().slice(0, 10);
  const untilStr = untilDate.toISOString().slice(0, 10);

  const insights = await graphGet<Insights>(`${account}/insights`, {
    fields: fieldsParam(["spend", "impressions", "clicks"]) ?? "",
    time_range: JSON.stringify({ since: sinceStr, until: untilStr }),
    time_increment: 1,
  });
  const recent = (insights.data ?? []).map((d) => ({
    date: d.date_start,
    spend: Number(d.spend),
    impressions: Number(d.impressions),
    clicks: Number(d.clicks),
  }));

  // Campaigns
  const campaigns = await graphGet<{ data: Array<{ id: string; name: string; effective_status: string }> }>(
    `${account}/campaigns`,
    { fields: fieldsParam(["id", "name", "effective_status"]) ?? "", limit: 100 },
  );
  const activeCampaigns = (campaigns.data ?? []).filter((c) => c.effective_status === "ACTIVE");

  // Adsets (account-wide)
  const adsets = await graphGet<{
    data: Array<{ id: string; name: string; effective_status: string; is_dynamic_creative?: boolean }>;
  }>(`${account}/adsets`, {
    fields: fieldsParam(["id", "name", "effective_status", "is_dynamic_creative"]) ?? "",
    limit: 200,
  });
  const adsetList = adsets.data ?? [];
  const activeAdsets = adsetList.filter((a) => a.effective_status === "ACTIVE");
  const dcAdsets = adsetList.filter((a) => a.is_dynamic_creative === true);

  // Build issues
  const issues: DiagnosisIssue[] = [];

  // 1. Account level
  if (accInfo.account_status !== 1) {
    issues.push({
      severity: "ERROR",
      category: "account",
      message: `account_status=${accInfo.account_status} (1 が正常). disable_reason=${accInfo.disable_reason}`,
      hint: "アカウント停止中。Business Manager で支払い / 規約違反などを確認。",
    });
  }

  // 2. Balance check
  const balance = Number(accInfo.balance);
  const dailyBudgetTotal = activeCampaigns.length * 3000; // rough estimate
  if (balance < dailyBudgetTotal * 2) {
    issues.push({
      severity: "WARN",
      category: "balance",
      message: `残高 ¥${balance} / 推定日予算 ¥${dailyBudgetTotal} = ${(balance / Math.max(dailyBudgetTotal, 1)).toFixed(1)} 日分`,
      hint: "残高 2 日分以下 = Meta が配信絞り始める。クレカ補充推奨。",
    });
  }

  // 3. Active state
  if (activeCampaigns.length === 0) {
    issues.push({
      severity: "ERROR",
      category: "campaign",
      message: "ACTIVE な campaign が 0",
      hint: "campaign を ACTIVE にしないと配信開始しない。update_campaign で status=ACTIVE に。",
    });
  }
  if (activeAdsets.length === 0) {
    issues.push({
      severity: "ERROR",
      category: "adset",
      message: "ACTIVE な adset が 0",
      hint: "adset を ACTIVE にする。campaign が ACTIVE でも adset が PAUSED だと配信ゼロ。",
    });
  }

  // 4. DC adset trap (1 active ad rule)
  for (const dc of dcAdsets) {
    if (dc.effective_status !== "ACTIVE") continue;
    const adsInDc = await graphGet<{ data: Array<{ id: string; effective_status: string }> }>(
      `${dc.id}/ads`,
      { fields: fieldsParam(["id", "effective_status"]) ?? "", limit: 50 },
    );
    const activeAds = (adsInDc.data ?? []).filter((a) => a.effective_status === "ACTIVE");
    if (activeAds.length > 1) {
      issues.push({
        severity: "ERROR",
        category: "dynamic_creative",
        message: `DC adset "${dc.name}" に ACTIVE ads が ${activeAds.length} 個 (1 のみ許可)`,
        hint: "「1 active ad per DC adset」ルール抵触で Meta が配信絞る。余分な ads を PAUSE するか、別 adset に分割。",
      });
    }
  }

  // 5. Recent spend trend
  const recentSpend = recent.reduce((a, d) => a + d.spend, 0);
  if (recentSpend === 0 && activeCampaigns.length > 0) {
    issues.push({
      severity: "ERROR",
      category: "delivery",
      message: `直近 ${args.compare_days} 日 spend ¥0 (ACTIVE campaign あり)`,
      hint: "Meta が配信絞ってる状態。DC adset 制約 / CV 閾値不足 / 学習フェーズ / クリエ審査などを疑う。docs/04-troubleshooting.md 参照。",
    });
  }
  // Trend: 直近 1 日が 7 日平均より大幅に下がってるか
  if (recent.length >= 2) {
    const today = recent[recent.length - 1]?.spend ?? 0;
    const avg = recent.slice(0, -1).reduce((a, d) => a + d.spend, 0) / Math.max(recent.length - 1, 1);
    if (avg > 100 && today < avg * 0.3) {
      issues.push({
        severity: "WARN",
        category: "delivery",
        message: `今日 spend ¥${today} vs ${args.compare_days - 1}日平均 ¥${avg.toFixed(0)} (70% 以上ダウン)`,
        hint: "急落。直近の変更 (creative 差替 / targeting 変更 / 予算変更) を疑う。",
      });
    }
  }

  // Summary
  let summary: string;
  const errors = issues.filter((i) => i.severity === "ERROR");
  const warns = issues.filter((i) => i.severity === "WARN");
  if (errors.length > 0) {
    summary = `🔴 ${errors.length} 件の重大問題 + ${warns.length} 件の警告`;
  } else if (warns.length > 0) {
    summary = `🟡 警告 ${warns.length} 件、配信自体は動作中の見込み`;
  } else {
    summary = `✅ 異常なし。直近 ${args.compare_days} 日 spend ¥${recentSpend} / ACTIVE campaigns ${activeCampaigns.length}`;
  }

  return {
    account: accInfo,
    recent_spend: recent,
    active_campaigns: activeCampaigns.length,
    active_adsets: activeAdsets.length,
    paused_or_archived_adsets: adsetList.length - activeAdsets.length,
    dynamic_creative_adsets: dcAdsets.length,
    issues,
    summary,
  };
}
