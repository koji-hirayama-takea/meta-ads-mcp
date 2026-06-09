import { z } from "zod";
import { graphPost } from "../graph-client.js";

export const updateCampaignSchema = z.object({
  campaign_id: z.string(),
  status: z.enum(["ACTIVE", "PAUSED", "ARCHIVED", "DELETED"]).optional(),
  daily_budget: z
    .number()
    .int()
    .min(100)
    .optional()
    .describe("In account currency cents (JPY = yen). Min 100."),
  lifetime_budget: z.number().int().min(100).optional(),
  name: z.string().optional(),
  bid_strategy: z
    .enum([
      "LOWEST_COST_WITHOUT_CAP",
      "LOWEST_COST_WITH_BID_CAP",
      "COST_CAP",
      "LOWEST_COST_WITH_MIN_ROAS",
    ])
    .optional(),
  start_time: z.string().optional(),
  stop_time: z.string().optional(),
  special_ad_categories: z.array(z.string()).optional(),
});

export async function updateCampaign(
  args: z.infer<typeof updateCampaignSchema>,
): Promise<{ success: boolean }> {
  const body: Record<string, unknown> = {};
  if (args.status) body.status = args.status;
  if (args.daily_budget !== undefined) body.daily_budget = args.daily_budget;
  if (args.lifetime_budget !== undefined) body.lifetime_budget = args.lifetime_budget;
  if (args.name) body.name = args.name;
  if (args.bid_strategy) body.bid_strategy = args.bid_strategy;
  if (args.start_time) body.start_time = args.start_time;
  if (args.stop_time) body.stop_time = args.stop_time;
  if (args.special_ad_categories) body.special_ad_categories = args.special_ad_categories;

  if (Object.keys(body).length === 0) {
    throw new Error("Nothing to update. Provide at least one field besides campaign_id.");
  }

  return graphPost<{ success: boolean }>(args.campaign_id, body);
}
