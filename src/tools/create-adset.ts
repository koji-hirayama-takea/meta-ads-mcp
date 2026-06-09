import { z } from "zod";
import { graphPost, resolveAccountId } from "../graph-client.js";

export const createAdsetSchema = z.object({
  account_id: z.string().optional(),
  campaign_id: z.string().describe("Parent campaign ID."),
  name: z.string(),
  status: z.enum(["ACTIVE", "PAUSED"]).default("PAUSED"),

  // Budget — set EITHER adset budget OR campaign-level CBO, not both
  daily_budget: z.number().int().min(100).optional(),
  lifetime_budget: z.number().int().min(100).optional(),

  // Optimization & billing — Meta requires these for non-Reach campaigns
  optimization_goal: z
    .string()
    .describe(
      "e.g. OFFSITE_CONVERSIONS (conversion campaigns), LINK_CLICKS, IMPRESSIONS, REACH, LEAD_GENERATION.",
    ),
  billing_event: z
    .string()
    .default("IMPRESSIONS")
    .describe("Usually IMPRESSIONS. LINK_CLICKS, etc. for legacy."),

  bid_amount: z.number().int().optional().describe("Required for cost-cap / bid-cap strategies."),
  bid_strategy: z
    .enum(["LOWEST_COST_WITHOUT_CAP", "LOWEST_COST_WITH_BID_CAP", "COST_CAP", "LOWEST_COST_WITH_MIN_ROAS"])
    .optional(),

  // Targeting — full spec object. See Meta docs for shape.
  targeting: z
    .record(z.unknown())
    .describe(
      'Full targeting spec. Example: {"geo_locations":{"countries":["JP"]},"age_min":25,"age_max":55,"genders":[1,2],"flexible_spec":[{"interests":[{"id":"6003107902433","name":"Marketing"}]}],"publisher_platforms":["facebook","instagram"],"facebook_positions":["feed"],"instagram_positions":["stream"]}',
    ),

  // Promoted object — required for conversion campaigns
  promoted_object: z
    .record(z.unknown())
    .optional()
    .describe(
      'Required for OUTCOME_LEADS / OUTCOME_SALES. Example: {"pixel_id":"2585209158578279","custom_event_type":"COMPLETE_REGISTRATION"}',
    ),

  start_time: z.string().optional(),
  end_time: z.string().optional(),

  // Attribution
  attribution_spec: z
    .array(z.record(z.unknown()))
    .optional()
    .describe(
      'CLICK_THROUGH window must match optimization_goal: LINK_CLICKS / LANDING_PAGE_VIEWS need 1d, OFFSITE_CONVERSIONS supports 7d. Example: [{"event_type":"CLICK_THROUGH","window_days":1}]. ⚠️ Meta forbids updating this post-creation, choose carefully.',
    ),

  // Dynamic Creative flag — 重要: ad の creative 形式と整合させる必要あり
  is_dynamic_creative: z
    .boolean()
    .optional()
    .describe(
      '⚠️ 必読: true なら DC adset (1 active ad only, asset_feed_spec creative のみ attach 可) / false (default) なら通常 adset (link_data creative 複数 attach 可)。一度設定すると変更不可。creative 形式と必ず一致させる。',
    ),
});

export async function createAdset(
  args: z.infer<typeof createAdsetSchema>,
): Promise<{ id: string }> {
  const account = resolveAccountId(args.account_id);
  const body: Record<string, unknown> = {
    name: args.name,
    campaign_id: args.campaign_id,
    status: args.status,
    optimization_goal: args.optimization_goal,
    billing_event: args.billing_event,
    targeting: args.targeting,
  };
  if (args.daily_budget !== undefined) body.daily_budget = args.daily_budget;
  if (args.lifetime_budget !== undefined) body.lifetime_budget = args.lifetime_budget;
  if (args.bid_amount !== undefined) body.bid_amount = args.bid_amount;
  if (args.bid_strategy) body.bid_strategy = args.bid_strategy;
  if (args.promoted_object) body.promoted_object = args.promoted_object;
  if (args.start_time) body.start_time = args.start_time;
  if (args.end_time) body.end_time = args.end_time;
  if (args.attribution_spec) body.attribution_spec = args.attribution_spec;
  if (args.is_dynamic_creative !== undefined) body.is_dynamic_creative = args.is_dynamic_creative;

  return graphPost<{ id: string }>(`${account}/adsets`, body);
}
