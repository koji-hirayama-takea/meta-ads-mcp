import { z } from "zod";
import { graphPost } from "../graph-client.js";

export const duplicateAdSchema = z.object({
  ad_id: z.string().describe("Source ad to duplicate."),
  target_adset_id: z
    .string()
    .optional()
    .describe("Destination adset. Defaults to source ad's adset (creates a sibling)."),
  status_option: z
    .enum(["ACTIVE", "PAUSED", "INHERITED_FROM_SOURCE"])
    .default("PAUSED")
    .describe("Status of the duplicate. PAUSED is safer for review."),
  rename_strategy: z
    .enum(["DEEP_COPY_NEW_OPTIONS", "RENAME_LEAF_LEVEL_BY_INDEX", "NO_RENAME"])
    .optional(),
  rename_prefix: z.string().optional(),
  rename_suffix: z.string().optional(),
});

export async function duplicateAd(
  args: z.infer<typeof duplicateAdSchema>,
): Promise<{ copied_ad_id: string }> {
  const body: Record<string, unknown> = {
    status_option: args.status_option,
  };
  if (args.target_adset_id) body.target_adset_id = args.target_adset_id;
  const rename: Record<string, unknown> = {};
  if (args.rename_strategy) rename.rename_strategy = args.rename_strategy;
  if (args.rename_prefix) rename.rename_prefix = args.rename_prefix;
  if (args.rename_suffix) rename.rename_suffix = args.rename_suffix;
  if (Object.keys(rename).length) body.rename_options = rename;

  return graphPost<{ copied_ad_id: string }>(`${args.ad_id}/copies`, body);
}
