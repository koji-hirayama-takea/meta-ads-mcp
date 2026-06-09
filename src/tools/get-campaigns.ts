import { z } from "zod";
import { fieldsParam, graphGet, resolveAccountId } from "../graph-client.js";
import type { Campaign, GraphListResponse } from "../types.js";

export const getCampaignsSchema = z.object({
  account_id: z
    .string()
    .optional()
    .describe('Meta ad account ID (with or without "act_" prefix). Defaults to META_DEFAULT_ACCOUNT_ID.'),
  status: z
    .array(z.enum(["ACTIVE", "PAUSED", "DELETED", "ARCHIVED"]))
    .optional()
    .describe("Filter by campaign status. Omit to return all."),
  fields: z
    .array(z.string())
    .optional()
    .describe(
      "Graph API fields to request. Default: id,name,status,effective_status,objective,daily_budget,lifetime_budget,start_time,created_time,updated_time.",
    ),
  limit: z.number().int().min(1).max(500).optional().default(50),
});

const DEFAULT_FIELDS = [
  "id",
  "name",
  "status",
  "effective_status",
  "objective",
  "daily_budget",
  "lifetime_budget",
  "bid_strategy",
  "start_time",
  "created_time",
  "updated_time",
];

export async function getCampaigns(
  args: z.infer<typeof getCampaignsSchema>,
): Promise<GraphListResponse<Campaign>> {
  const account = resolveAccountId(args.account_id);
  const params: Record<string, string | number> = {
    fields: fieldsParam(args.fields ?? DEFAULT_FIELDS) ?? "",
    limit: args.limit ?? 50,
  };
  if (args.status?.length) {
    params.effective_status = JSON.stringify(args.status);
  }
  return graphGet<GraphListResponse<Campaign>>(`${account}/campaigns`, params);
}
