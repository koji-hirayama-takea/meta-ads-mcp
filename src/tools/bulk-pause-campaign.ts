import { z } from "zod";
import { fieldsParam, graphGet, graphPost } from "../graph-client.js";
import type { Adset, GraphListResponse } from "../types.js";

export const bulkPauseCampaignSchema = z.object({
  campaign_id: z.string().describe("Campaign to pause (and all its adsets + ads via cascade or explicit)."),
  cascade: z
    .boolean()
    .default(true)
    .describe(
      "If true, also PAUSE all adsets within. Meta cascades campaign PAUSE to adsets automatically at delivery level (effective_status=CAMPAIGN_PAUSED), but explicit adset PAUSE gives configured_status=PAUSED visibility in UI. Default true for clarity.",
    ),
});

export async function bulkPauseCampaign(
  args: z.infer<typeof bulkPauseCampaignSchema>,
): Promise<{ campaign: boolean; adsets_paused: number; adset_failures: string[] }> {
  // 1. Pause campaign itself
  await graphPost(args.campaign_id, { status: "PAUSED" });

  if (!args.cascade) {
    return { campaign: true, adsets_paused: 0, adset_failures: [] };
  }

  // 2. List adsets under this campaign
  const adsetsRes = await graphGet<GraphListResponse<Adset>>(`${args.campaign_id}/adsets`, {
    fields: fieldsParam(["id", "name", "status"]) ?? "",
    limit: 100,
  });

  // 3. Pause each adset (skip already-PAUSED / DELETED)
  let paused = 0;
  const failures: string[] = [];
  for (const adset of adsetsRes.data ?? []) {
    if (adset.status === "PAUSED" || adset.status === "DELETED" || adset.status === "ARCHIVED") {
      continue;
    }
    try {
      await graphPost(adset.id, { status: "PAUSED" });
      paused++;
    } catch (e) {
      failures.push(`${adset.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { campaign: true, adsets_paused: paused, adset_failures: failures };
}
