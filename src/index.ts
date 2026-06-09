#!/usr/bin/env node
import { config as loadDotenv } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { zodToJsonSchema } from "zod-to-json-schema";
import { z, type ZodSchema } from "zod";

// Load .env.local before importing anything that reads process.env.
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
loadDotenv({ path: resolve(__dirname, "..", ".env.local") });

// Tools — schemas + handlers
import { getCampaigns, getCampaignsSchema } from "./tools/get-campaigns.js";
import { getAdsets, getAdsetsSchema } from "./tools/get-adsets.js";
import { getAds, getAdsSchema } from "./tools/get-ads.js";
import { getAdCreatives, getAdCreativesSchema } from "./tools/get-ad-creatives.js";
import { getInsights, getInsightsSchema } from "./tools/get-insights.js";
import { updateAd, updateAdSchema } from "./tools/update-ad.js";
import { updateCampaign, updateCampaignSchema } from "./tools/update-campaign.js";
import { updateAdset, updateAdsetSchema } from "./tools/update-adset.js";
import { createAdCreative, createAdCreativeSchema } from "./tools/create-ad-creative.js";
import { uploadAdImage, uploadAdImageSchema } from "./tools/upload-ad-image.js";
import { cloneCreativeWithUrl, cloneCreativeWithUrlSchema } from "./tools/clone-creative-with-url.js";
import { createCampaign, createCampaignSchema } from "./tools/create-campaign.js";
import { createAdset, createAdsetSchema } from "./tools/create-adset.js";
import { createAd, createAdSchema } from "./tools/create-ad.js";
import { searchGeoLocations, searchGeoLocationsSchema } from "./tools/search-geo-locations.js";
import { searchInterests, searchInterestsSchema } from "./tools/search-interests.js";
import { getAdAccounts, getAdAccountsSchema } from "./tools/get-ad-accounts.js";
import { getAccountPages, getAccountPagesSchema } from "./tools/get-account-pages.js";
import { getAdPreviews, getAdPreviewsSchema } from "./tools/get-ad-previews.js";
import { duplicateAd, duplicateAdSchema } from "./tools/duplicate-ad.js";
import { deleteCampaign, deleteCampaignSchema } from "./tools/delete-campaign.js";
import { deleteAdset, deleteAdsetSchema } from "./tools/delete-adset.js";
import { deleteAd, deleteAdSchema } from "./tools/delete-ad.js";
import { bulkPauseCampaign, bulkPauseCampaignSchema } from "./tools/bulk-pause-campaign.js";
import { diagnoseDelivery, diagnoseDeliverySchema } from "./tools/diagnose-delivery.js";
import { diagnoseAdset, diagnoseAdsetSchema } from "./tools/diagnose-adset.js";

type ToolDef<S extends ZodSchema> = {
  name: string;
  description: string;
  schema: S;
  handler: (args: z.infer<S>) => Promise<unknown>;
};

const TOOLS: ToolDef<ZodSchema>[] = [
  {
    name: "get_campaigns",
    description:
      "List campaigns under a Meta ad account. Optional status filter and field selection.",
    schema: getCampaignsSchema,
    handler: getCampaigns as never,
  },
  {
    name: "get_adsets",
    description:
      "List ad sets, either for a single campaign (campaign_id) or account-wide (account_id).",
    schema: getAdsetsSchema,
    handler: getAdsets as never,
  },
  {
    name: "get_ads",
    description:
      "List ads. Scope by adset_id, campaign_id, or account_id (most specific wins).",
    schema: getAdsSchema,
    handler: getAds as never,
  },
  {
    name: "get_ad_creatives",
    description:
      "Fetch one creative by creative_id, or all creatives attached to an ad by ad_id. Use this to inspect the current link URL before cloning.",
    schema: getAdCreativesSchema,
    handler: getAdCreatives as never,
  },
  {
    name: "get_insights",
    description:
      "Fetch performance insights at account/campaign/adset/ad level. Supports date_preset, time_range, and breakdowns.",
    schema: getInsightsSchema,
    handler: getInsights as never,
  },
  {
    name: "update_ad",
    description:
      "Update an ad — pause/resume, rename, swap to a different creative (creative-only swap does NOT reset Meta learning), adjust bid/tracking.",
    schema: updateAdSchema,
    handler: updateAd as never,
  },
  {
    name: "update_campaign",
    description:
      "Update a campaign — status, daily/lifetime budget, bid strategy, schedule, name.",
    schema: updateCampaignSchema,
    handler: updateCampaign as never,
  },
  {
    name: "update_adset",
    description:
      "Update an adset — status, budget, bid, targeting, schedule, optimization goal.",
    schema: updateAdsetSchema,
    handler: updateAdset as never,
  },
  {
    name: "create_ad_creative",
    description:
      "Create a new ad creative from object_story_spec, asset_feed_spec, or an existing post. Use url_tags to inject UTM params at the account level.",
    schema: createAdCreativeSchema,
    handler: createAdCreative as never,
  },
  {
    name: "upload_ad_image",
    description:
      "Upload an image to the ad account's image library. Returns image_hash for use in object_story_spec.link_data.image_hash.",
    schema: uploadAdImageSchema,
    handler: uploadAdImage as never,
  },
  {
    name: "clone_creative_with_url",
    description:
      "Clone an existing ad creative with a new click URL (typically the same LP URL with UTM params appended). Optionally swap the new creative onto an ad in one call. Use this to inject UTM into running ads without resetting Meta learning — creatives are immutable in Meta, so 'change the URL' really means clone + swap.",
    schema: cloneCreativeWithUrlSchema,
    handler: cloneCreativeWithUrl as never,
  },
  {
    name: "create_campaign",
    description:
      "Create a new campaign. Defaults to status=PAUSED for safety — flip to ACTIVE only after review. special_ad_categories is required (use [] if none apply).",
    schema: createCampaignSchema,
    handler: createCampaign as never,
  },
  {
    name: "create_adset",
    description:
      "Create a new ad set under a campaign. Requires targeting spec, optimization_goal, billing_event. For conversion campaigns also supply promoted_object with pixel_id + custom_event_type.",
    schema: createAdsetSchema,
    handler: createAdset as never,
  },
  {
    name: "create_ad",
    description:
      "Create a new ad in an existing adset. Supply either creative_id (attach existing creative) or creative_spec (inline). Defaults to PAUSED.",
    schema: createAdSchema,
    handler: createAd as never,
  },
  {
    name: "search_geo_locations",
    description:
      "Search Meta's geo location DB for targeting. Returns location keys to embed in adset targeting.geo_locations. type=adgeolocation is the combined endpoint.",
    schema: searchGeoLocationsSchema,
    handler: searchGeoLocations as never,
  },
  {
    name: "search_interests",
    description:
      "Search Meta's interest taxonomy for targeting. Returns interest IDs to embed in adset targeting.flexible_spec.interests.",
    schema: searchInterestsSchema,
    handler: searchInterests as never,
  },
  {
    name: "get_ad_accounts",
    description:
      "List ad accounts accessible by the System User Token. Use this to verify which accounts are reachable.",
    schema: getAdAccountsSchema,
    handler: getAdAccounts as never,
  },
  {
    name: "get_account_pages",
    description:
      "List Facebook Pages promotable from the ad account (page_id values for object_story_spec.page_id when creating creatives).",
    schema: getAccountPagesSchema,
    handler: getAccountPages as never,
  },
  {
    name: "get_ad_previews",
    description:
      "Render a preview of an ad or creative for a specific placement (DESKTOP_FEED_STANDARD, MOBILE_FEED_STANDARD, INSTAGRAM_STANDARD, INSTAGRAM_STORY, FACEBOOK_REELS_MOBILE, etc.). Returns HTML body — useful for pre-launch QA.",
    schema: getAdPreviewsSchema,
    handler: getAdPreviews as never,
  },
  {
    name: "duplicate_ad",
    description:
      "Duplicate an existing ad — either as a sibling in the same adset or into a different adset. Defaults to PAUSED. Common pattern for A/B variants.",
    schema: duplicateAdSchema,
    handler: duplicateAd as never,
  },
  {
    name: "delete_campaign",
    description:
      "Soft-delete a campaign (status → DELETED). Cascade deletes child adsets + ads. Historical insights remain queryable via API (Meta keeps data). UI hides DELETED entities by default; use filter to view.",
    schema: deleteCampaignSchema,
    handler: deleteCampaign as never,
  },
  {
    name: "delete_adset",
    description:
      "Soft-delete an adset (status → DELETED). Cascade deletes child ads. Insights remain queryable.",
    schema: deleteAdsetSchema,
    handler: deleteAdset as never,
  },
  {
    name: "delete_ad",
    description:
      "Soft-delete a single ad (status → DELETED). For bulk cleanup prefer delete_campaign / delete_adset (cascade is faster).",
    schema: deleteAdSchema,
    handler: deleteAd as never,
  },
  {
    name: "bulk_pause_campaign",
    description:
      "Pause a campaign and all its adsets in one call. Default cascade=true also flips each adset to PAUSED (clearer UI than relying only on campaign-level pause). Returns paused count + failures.",
    schema: bulkPauseCampaignSchema,
    handler: bulkPauseCampaign as never,
  },
  {
    name: "diagnose_delivery",
    description:
      "Account-wide delivery health check. Returns: account info, recent N-day spend trend, active campaign/adset counts, DC adset count, and structured issues list (account stopped / low balance / no active adsets / DC adset 1-ad rule violations / zero spend despite active / sudden drop). Use when configuration looks fine but delivery is mysteriously low/zero.",
    schema: diagnoseDeliverySchema,
    handler: diagnoseDelivery as never,
  },
  {
    name: "diagnose_adset",
    description:
      "Single adset health check. Returns: adset details, attached ads count (total + active), recent N-day metrics + CV event breakdown, and structured issues list (status mismatch / DC 1-ad rule / attribution-optimization mismatch / CV under threshold / zero delivery / Meta-reported issues). Use to debug a specific adset that isn't delivering.",
    schema: diagnoseAdsetSchema,
    handler: diagnoseAdset as never,
  },
];

const server = new Server(
  { name: "meta-ads", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS.map<Tool>((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(t.schema, {
      $refStrategy: "none",
      target: "openApi3",
    }) as Tool["inputSchema"],
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const tool = TOOLS.find((t) => t.name === req.params.name);
  if (!tool) {
    return {
      content: [{ type: "text", text: `Unknown tool: ${req.params.name}` }],
      isError: true,
    };
  }
  const parsed = tool.schema.safeParse(req.params.arguments ?? {});
  if (!parsed.success) {
    return {
      content: [
        { type: "text", text: `Invalid arguments:\n${JSON.stringify(parsed.error.format(), null, 2)}` },
      ],
      isError: true,
    };
  }
  try {
    const result = await tool.handler(parsed.data);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (e) {
    const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    return { content: [{ type: "text", text: msg }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
