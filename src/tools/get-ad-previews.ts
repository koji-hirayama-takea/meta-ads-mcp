import { z } from "zod";
import { graphGet } from "../graph-client.js";

export const getAdPreviewsSchema = z
  .object({
    ad_id: z.string().optional().describe("Preview an existing ad."),
    creative_id: z.string().optional().describe("Preview a creative not yet attached to an ad."),
    ad_format: z
      .enum([
        "DESKTOP_FEED_STANDARD",
        "MOBILE_FEED_STANDARD",
        "MOBILE_FEED_BASIC",
        "MOBILE_BANNER",
        "MOBILE_INTERSTITIAL",
        "MOBILE_NATIVE",
        "INSTAGRAM_STANDARD",
        "INSTAGRAM_STORY",
        "INSTAGRAM_REELS",
        "INSTAGRAM_EXPLORE_GRID_HOME",
        "INSTAGRAM_EXPLORE_CONTEXTUAL",
        "INSTAGRAM_SHOP",
        "FACEBOOK_REELS_MOBILE",
        "FACEBOOK_STORY_MOBILE",
        "AUDIENCE_NETWORK_INSTREAM_VIDEO_MOBILE",
        "MARKETPLACE_MOBILE",
      ])
      .describe("Placement to render."),
  })
  .refine((a) => a.ad_id || a.creative_id, {
    message: "ad_id or creative_id is required.",
  });

type Preview = { body: string };

export async function getAdPreviews(
  args: z.infer<typeof getAdPreviewsSchema>,
): Promise<{ data: Preview[] }> {
  const path = args.ad_id ? `${args.ad_id}/previews` : `${args.creative_id}/previews`;
  return graphGet<{ data: Preview[] }>(path, { ad_format: args.ad_format });
}
