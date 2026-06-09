import { z } from "zod";
import { graphDelete } from "../graph-client.js";

export const deleteAdsetSchema = z.object({
  adset_id: z.string().describe("Adset to delete (soft delete, status flips to DELETED)."),
});

// 子の ads も cascade で DELETED 化する。insights API は引き続きクエリ可能。

export async function deleteAdset(
  args: z.infer<typeof deleteAdsetSchema>,
): Promise<{ success: boolean }> {
  return graphDelete<{ success: boolean }>(args.adset_id);
}
