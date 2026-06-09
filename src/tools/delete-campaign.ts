import { z } from "zod";
import { graphDelete } from "../graph-client.js";

export const deleteCampaignSchema = z.object({
  campaign_id: z.string().describe("Campaign to delete (soft delete = status flips to DELETED)."),
});

// Meta は soft delete. status=DELETED で UI から見えなくなるが、insights API は引き続き
// クエリ可 (履歴データ保持)。完全に消えるわけではない。

export async function deleteCampaign(
  args: z.infer<typeof deleteCampaignSchema>,
): Promise<{ success: boolean }> {
  return graphDelete<{ success: boolean }>(args.campaign_id);
}
