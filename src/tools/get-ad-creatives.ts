import { z } from "zod";
import { fieldsParam, graphGet } from "../graph-client.js";
import type { AdCreative, GraphListResponse } from "../types.js";

export const getAdCreativesSchema = z
  .object({
    creative_id: z.string().optional().describe("Fetch a single creative."),
    ad_id: z
      .string()
      .optional()
      .describe("Fetch all creatives attached to an ad."),
    fields: z.array(z.string()).optional(),
  })
  .refine((a) => a.creative_id || a.ad_id, {
    message: "creative_id or ad_id is required.",
  });

const DEFAULT_FIELDS = [
  "id",
  "name",
  "object_story_spec",
  "asset_feed_spec",
  "call_to_action_type",
  "effective_object_story_id",
  "image_hash",
  "image_url",
  "thumbnail_url",
  "url_tags",
];

export async function getAdCreatives(
  args: z.infer<typeof getAdCreativesSchema>,
): Promise<AdCreative | GraphListResponse<AdCreative>> {
  const params = { fields: fieldsParam(args.fields ?? DEFAULT_FIELDS) ?? "" };
  if (args.creative_id) {
    return graphGet<AdCreative>(args.creative_id, params);
  }
  return graphGet<GraphListResponse<AdCreative>>(
    `${args.ad_id}/adcreatives`,
    params,
  );
}
