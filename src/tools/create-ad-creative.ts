import { z } from "zod";
import { graphPost, resolveAccountId } from "../graph-client.js";

export const createAdCreativeSchema = z.object({
  account_id: z.string().optional().describe("Account ID. Defaults to META_DEFAULT_ACCOUNT_ID."),
  name: z.string().describe("Creative name (for ad ops, not user-visible)."),
  object_story_spec: z
    .record(z.unknown())
    .optional()
    .describe(
      "Full object_story_spec (page_id + link_data | photo_data | video_data). Required unless using asset_feed_spec or object_story_id.",
    ),
  asset_feed_spec: z.record(z.unknown()).optional(),
  object_story_id: z
    .string()
    .optional()
    .describe("Use an existing FB/IG post as the creative (page_id_post_id)."),
  call_to_action_type: z.string().optional(),
  url_tags: z
    .string()
    .optional()
    .describe(
      'URL query params appended to the click URL. Use for UTM injection: "utm_source=meta&utm_medium=cpc&utm_campaign=lp2-2026-05&utm_content={{ad.name}}". Meta-expands {{ad.id}}/{{ad.name}}/{{adset.id}}/{{adset.name}}/{{campaign.id}}/{{campaign.name}}/{{placement}}/{{site_source_name}}.',
    ),
  degrees_of_freedom_spec: z.record(z.unknown()).optional(),
});

export async function createAdCreative(
  args: z.infer<typeof createAdCreativeSchema>,
): Promise<{ id: string }> {
  const account = resolveAccountId(args.account_id);
  const body: Record<string, unknown> = { name: args.name };
  if (args.object_story_spec) body.object_story_spec = args.object_story_spec;
  if (args.asset_feed_spec) body.asset_feed_spec = args.asset_feed_spec;
  if (args.object_story_id) body.object_story_id = args.object_story_id;
  if (args.call_to_action_type) body.call_to_action_type = args.call_to_action_type;
  if (args.url_tags) body.url_tags = args.url_tags;
  if (args.degrees_of_freedom_spec) body.degrees_of_freedom_spec = args.degrees_of_freedom_spec;

  return graphPost<{ id: string }>(`${account}/adcreatives`, body);
}
