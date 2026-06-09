import { z } from "zod";
import { fieldsParam, graphGet, resolveAccountId } from "../graph-client.js";
import type { Ad, GraphListResponse } from "../types.js";

export const getAdsSchema = z.object({
  adset_id: z.string().optional().describe("Limit to one adset."),
  campaign_id: z.string().optional().describe("Limit to one campaign."),
  account_id: z.string().optional().describe("Account-wide ad list."),
  status: z.array(z.enum(["ACTIVE", "PAUSED", "DELETED", "ARCHIVED"])).optional(),
  fields: z.array(z.string()).optional(),
  limit: z.number().int().min(1).max(500).optional().default(50),
});

const DEFAULT_FIELDS = [
  "id",
  "name",
  "adset_id",
  "campaign_id",
  "status",
  "effective_status",
  "creative",
  "conversion_domain",
  "created_time",
  "updated_time",
];

export async function getAds(
  args: z.infer<typeof getAdsSchema>,
): Promise<GraphListResponse<Ad>> {
  const params: Record<string, string | number> = {
    fields: fieldsParam(args.fields ?? DEFAULT_FIELDS) ?? "",
    limit: args.limit ?? 50,
  };
  if (args.status?.length) {
    params.effective_status = JSON.stringify(args.status);
  }
  const path = args.adset_id
    ? `${args.adset_id}/ads`
    : args.campaign_id
      ? `${args.campaign_id}/ads`
      : `${resolveAccountId(args.account_id)}/ads`;
  return graphGet<GraphListResponse<Ad>>(path, params);
}
