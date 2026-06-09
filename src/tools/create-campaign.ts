import { z } from "zod";
import { graphPost, resolveAccountId } from "../graph-client.js";

export const createCampaignSchema = z.object({
  account_id: z.string().optional(),
  name: z.string().describe("Campaign name shown in Ads Manager."),
  objective: z
    .enum([
      "OUTCOME_AWARENESS",
      "OUTCOME_TRAFFIC",
      "OUTCOME_ENGAGEMENT",
      "OUTCOME_LEADS",
      "OUTCOME_APP_PROMOTION",
      "OUTCOME_SALES",
    ])
    .describe("Campaign objective. OUTCOME_LEADS for CompleteRegistration funnels (typical for SaaS sign-up)."),
  status: z
    .enum(["ACTIVE", "PAUSED"])
    .default("PAUSED")
    .describe("Initial status. Defaults to PAUSED — safer for review before going live."),
  special_ad_categories: z
    .array(z.enum(["CREDIT", "EMPLOYMENT", "HOUSING", "ISSUES_ELECTIONS_POLITICS", "FINANCIAL_PRODUCTS_SERVICES", "ONLINE_GAMBLING_AND_GAMING"]))
    .default([])
    .describe("Always required (empty array if none apply)."),
  daily_budget: z
    .number()
    .int()
    .min(100)
    .optional()
    .describe("Campaign-level daily budget (CBO). Set EITHER this OR adset-level budget, not both."),
  lifetime_budget: z.number().int().min(100).optional(),
  bid_strategy: z
    .enum(["LOWEST_COST_WITHOUT_CAP", "LOWEST_COST_WITH_BID_CAP", "COST_CAP", "LOWEST_COST_WITH_MIN_ROAS"])
    .optional(),
  buying_type: z.enum(["AUCTION", "RESERVED"]).default("AUCTION"),
  start_time: z.string().optional(),
  stop_time: z.string().optional(),
});

export async function createCampaign(
  args: z.infer<typeof createCampaignSchema>,
): Promise<{ id: string }> {
  const account = resolveAccountId(args.account_id);
  const body: Record<string, unknown> = {
    name: args.name,
    objective: args.objective,
    status: args.status,
    special_ad_categories: args.special_ad_categories,
    buying_type: args.buying_type,
  };
  if (args.daily_budget !== undefined) body.daily_budget = args.daily_budget;
  if (args.lifetime_budget !== undefined) body.lifetime_budget = args.lifetime_budget;
  if (args.bid_strategy) body.bid_strategy = args.bid_strategy;
  if (args.start_time) body.start_time = args.start_time;
  if (args.stop_time) body.stop_time = args.stop_time;

  return graphPost<{ id: string }>(`${account}/campaigns`, body);
}
