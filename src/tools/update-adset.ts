import { z } from "zod";
import { graphPost } from "../graph-client.js";

export const updateAdsetSchema = z.object({
  adset_id: z.string(),
  status: z.enum(["ACTIVE", "PAUSED", "ARCHIVED", "DELETED"]).optional(),
  daily_budget: z.number().int().min(100).optional(),
  lifetime_budget: z.number().int().min(100).optional(),
  bid_amount: z.number().int().optional(),
  name: z.string().optional(),
  targeting: z.record(z.unknown()).optional().describe("Full Meta targeting spec object."),
  promoted_object: z.record(z.unknown()).optional(),
  optimization_goal: z.string().optional(),
  billing_event: z.string().optional(),
  start_time: z.string().optional(),
  end_time: z.string().optional(),
});

export async function updateAdset(
  args: z.infer<typeof updateAdsetSchema>,
): Promise<{ success: boolean }> {
  const body: Record<string, unknown> = {};
  if (args.status) body.status = args.status;
  if (args.daily_budget !== undefined) body.daily_budget = args.daily_budget;
  if (args.lifetime_budget !== undefined) body.lifetime_budget = args.lifetime_budget;
  if (args.bid_amount !== undefined) body.bid_amount = args.bid_amount;
  if (args.name) body.name = args.name;
  if (args.targeting) body.targeting = args.targeting;
  if (args.promoted_object) body.promoted_object = args.promoted_object;
  if (args.optimization_goal) body.optimization_goal = args.optimization_goal;
  if (args.billing_event) body.billing_event = args.billing_event;
  if (args.start_time) body.start_time = args.start_time;
  if (args.end_time) body.end_time = args.end_time;

  if (Object.keys(body).length === 0) {
    throw new Error("Nothing to update. Provide at least one field besides adset_id.");
  }

  return graphPost<{ success: boolean }>(args.adset_id, body);
}
