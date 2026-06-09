import { z } from "zod";
import { fieldsParam, graphGet, graphPost, resolveAccountId } from "../graph-client.js";
import { GraphApiError, type AdCreative } from "../types.js";

export const cloneCreativeWithUrlSchema = z.object({
  source_creative_id: z.string().describe("Existing creative to clone."),
  new_link_url: z.string().url().describe("Replacement click URL (typically same LP URL with utm params appended)."),
  new_name: z.string().optional().describe("Name for the cloned creative. Defaults to source name + ' (utm)'."),
  account_id: z.string().optional(),
  apply_to_ad_id: z
    .string()
    .optional()
    .describe(
      "If provided, the new creative is immediately attached to this ad (single round-trip swap). Learning is NOT reset by a creative-only swap.",
    ),
  format: z
    .enum(["auto", "link_data", "asset_feed_spec"])
    .default("auto")
    .describe(
      "creative 形式: link_data = 通常 ad (1 adset / N ads OK、ただし App Review 必須で自作 MCP では #3 で失敗しやすい) / asset_feed_spec = Dynamic Creative (Live mode + pages_manage_ads で作れるが DC adset 化罠あり) / auto = link_data 試行 → #3 なら asset_feed_spec フォールバック。docs/06-pipeboard-hybrid.md 参照 — link_data 確実に作るなら Pipeboard MCP の create_ad_creative 推奨。",
    ),
});

// 5/29〜6/1 の知見メモ:
// - link_data: 「正しい」形式、1 adset / N ads 構造 OK、Meta UI 編集自然
//   ただし POST /adcreatives で #3 capability error が App Review なし環境で出やすい
// - asset_feed_spec: Dynamic Creative format、Live mode + pages_manage_ads で作れる
//   ただし attach 先 adset が DC 化 → 1 active ad only ルール抵触で配信ゼロのリスク
// - 実運用は Pipeboard で link_data 作って自作 MCP で運用が推奨パス (docs/06)

type LinkData = {
  link?: string;
  message?: string;
  name?: string;
  description?: string;
  caption?: string;
  call_to_action?: { type: string; value?: { link?: string } };
  image_hash?: string;
};

type StorySpec = {
  page_id?: string;
  link_data?: LinkData;
  photo_data?: { image_hash?: string; caption?: string };
} & Record<string, unknown>;

type AssetFeedSpec = {
  images?: Array<{ hash: string }>;
  bodies?: Array<{ text: string }>;
  titles?: Array<{ text: string }>;
  descriptions?: Array<{ text: string }>;
  link_urls?: Array<{ website_url: string }>;
  call_to_action_types?: string[];
  ad_formats?: string[];
};

type CreativeFields = {
  pageId: string;
  imageHash: string;
  message: string;
  title: string;
  description: string;
  ctaType: string;
};

function extractFields(source: AdCreative): CreativeFields {
  const sourceStory = (source.object_story_spec ?? {}) as StorySpec;
  const sourceLinkData = sourceStory.link_data ?? {};
  const sourceAfs = source.asset_feed_spec as AssetFeedSpec | undefined;

  const imageHash =
    sourceLinkData.image_hash ?? sourceAfs?.images?.[0]?.hash ?? sourceStory.photo_data?.image_hash;
  const message = sourceAfs?.bodies?.[0]?.text ?? sourceLinkData.message ?? "";
  const title = sourceAfs?.titles?.[0]?.text ?? sourceLinkData.name ?? "";
  const description = sourceAfs?.descriptions?.[0]?.text ?? sourceLinkData.description ?? "";
  const ctaType =
    sourceAfs?.call_to_action_types?.[0] ??
    sourceLinkData.call_to_action?.type ??
    source.call_to_action_type ??
    "LEARN_MORE";
  const pageId = sourceStory.page_id;

  if (!pageId) throw new Error(`Source creative ${source.id} has no page_id.`);
  if (!imageHash) throw new Error(`Source creative ${source.id} has no image_hash.`);

  return { pageId, imageHash, message, title, description, ctaType };
}

function buildLinkDataBody(
  args: z.infer<typeof cloneCreativeWithUrlSchema>,
  source: AdCreative,
  fields: CreativeFields,
): Record<string, unknown> {
  return {
    name: args.new_name ?? `${source.name ?? source.id} (utm, link_data)`,
    object_story_spec: {
      page_id: fields.pageId,
      link_data: {
        link: args.new_link_url,
        message: fields.message,
        name: fields.title,
        description: fields.description,
        image_hash: fields.imageHash,
        call_to_action: {
          type: fields.ctaType,
          value: { link: args.new_link_url },
        },
      },
    },
  };
}

function buildAssetFeedSpecBody(
  args: z.infer<typeof cloneCreativeWithUrlSchema>,
  source: AdCreative,
  fields: CreativeFields,
): Record<string, unknown> {
  const assetFeedSpec: AssetFeedSpec = {
    images: [{ hash: fields.imageHash }],
    bodies: [{ text: fields.message }],
    titles: [{ text: fields.title }],
    link_urls: [{ website_url: args.new_link_url }],
    call_to_action_types: [fields.ctaType],
    ad_formats: ["SINGLE_IMAGE"],
  };
  if (fields.description) assetFeedSpec.descriptions = [{ text: fields.description }];

  return {
    name: args.new_name ?? `${source.name ?? source.id} (utm, afs)`,
    object_story_spec: { page_id: fields.pageId },
    asset_feed_spec: assetFeedSpec,
  };
}

export async function cloneCreativeWithUrl(
  args: z.infer<typeof cloneCreativeWithUrlSchema>,
): Promise<{ creative_id: string; format_used: "link_data" | "asset_feed_spec"; applied_to_ad?: string; fallback_reason?: string }> {
  const account = resolveAccountId(args.account_id);

  const source = await graphGet<AdCreative>(args.source_creative_id, {
    fields: fieldsParam([
      "id",
      "name",
      "object_story_spec",
      "asset_feed_spec",
      "call_to_action_type",
      "url_tags",
    ])!,
  });

  const fields = extractFields(source);

  let createdId: string;
  let formatUsed: "link_data" | "asset_feed_spec";
  let fallbackReason: string | undefined;

  if (args.format === "link_data") {
    const res = await graphPost<{ id: string }>(
      `${account}/adcreatives`,
      buildLinkDataBody(args, source, fields),
    );
    createdId = res.id;
    formatUsed = "link_data";
  } else if (args.format === "asset_feed_spec") {
    const res = await graphPost<{ id: string }>(
      `${account}/adcreatives`,
      buildAssetFeedSpecBody(args, source, fields),
    );
    createdId = res.id;
    formatUsed = "asset_feed_spec";
  } else {
    // auto: try link_data first, fall back to asset_feed_spec on #3
    try {
      const res = await graphPost<{ id: string }>(
        `${account}/adcreatives`,
        buildLinkDataBody(args, source, fields),
      );
      createdId = res.id;
      formatUsed = "link_data";
    } catch (e) {
      if (e instanceof GraphApiError && e.code === 3) {
        fallbackReason = `link_data 失敗 (#3 capability), asset_feed_spec にフォールバック。link_data 確実に作るなら Pipeboard MCP 推奨 (docs/06)。`;
        const res = await graphPost<{ id: string }>(
          `${account}/adcreatives`,
          buildAssetFeedSpecBody(args, source, fields),
        );
        createdId = res.id;
        formatUsed = "asset_feed_spec";
      } else {
        throw e;
      }
    }
  }

  let appliedTo: string | undefined;
  if (args.apply_to_ad_id) {
    await graphPost(args.apply_to_ad_id, { creative: { creative_id: createdId } });
    appliedTo = args.apply_to_ad_id;
  }

  return {
    creative_id: createdId,
    format_used: formatUsed,
    applied_to_ad: appliedTo,
    ...(fallbackReason ? { fallback_reason: fallbackReason } : {}),
  };
}
