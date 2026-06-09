import { z } from "zod";
import { graphPost } from "../graph-client.js";

export const updateAdSchema = z.object({
  ad_id: z.string().describe("Ad ID to update."),
  status: z.enum(["ACTIVE", "PAUSED", "ARCHIVED", "DELETED"]).optional(),
  creative_id: z
    .string()
    .optional()
    .describe(
      "Swap to a new creative. Use this for UTM-tag fixes — creating a new creative and pointing the ad at it preserves learning (creative-only updates are not a learning reset).",
    ),
  name: z.string().optional(),
  bid_amount: z.number().int().optional().describe("In account currency cents."),
  tracking_specs: z.array(z.record(z.unknown())).optional(),
  conversion_specs: z.array(z.record(z.unknown())).optional(),
});

export async function updateAd(args: z.infer<typeof updateAdSchema>): Promise<{ success: boolean }> {
  const body: Record<string, unknown> = {};
  if (args.status) body.status = args.status;
  if (args.creative_id) body.creative = { creative_id: args.creative_id };
  if (args.name) body.name = args.name;
  if (args.bid_amount !== undefined) body.bid_amount = args.bid_amount;
  if (args.tracking_specs) body.tracking_specs = args.tracking_specs;
  if (args.conversion_specs) body.conversion_specs = args.conversion_specs;

  if (Object.keys(body).length === 0) {
    throw new Error("Nothing to update. Provide at least one field besides ad_id.");
  }

  return graphPost<{ success: boolean }>(args.ad_id, body);
}
