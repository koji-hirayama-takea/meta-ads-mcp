import { z } from "zod";
import { graphDelete } from "../graph-client.js";

export const deleteAdSchema = z.object({
  ad_id: z.string().describe("Ad to delete (soft delete, status flips to DELETED)."),
});

// 個別 ad の削除。campaign / adset 単位で削除する場合は delete_campaign / delete_adset
// を使うほうが効率的 (子要素は cascade)。

export async function deleteAd(
  args: z.infer<typeof deleteAdSchema>,
): Promise<{ success: boolean }> {
  return graphDelete<{ success: boolean }>(args.ad_id);
}
