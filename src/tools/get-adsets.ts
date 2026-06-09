import { z } from "zod";
import { fieldsParam, graphGet, resolveAccountId } from "../graph-client.js";
import type { Adset, GraphListResponse } from "../types.js";

export const getAdsetsSchema = z
  .object({
    campaign_id: z.string().optional().describe("Limit to one campaign's adsets."),
    account_id: z.string().optional().describe("Account-wide adset list. Defaults to META_DEFAULT_ACCOUNT_ID if campaign_id omitted."),
    status: z.array(z.enum(["ACTIVE", "PAUSED", "DELETED", "ARCHIVED"])).optional(),
    fields: z.array(z.string()).optional(),
    limit: z.number().int().min(1).max(500).optional().default(50),
  })
  .refine((a) => a.campaign_id || a.account_id || true, {
    message: "campaign_id or account_id must be supplied (or default).",
  });

const DEFAULT_FIELDS = [
  "id",
  "name",
  "campaign_id",
  "status",
  "effective_status",
  "daily_budget",
  "lifetime_budget",
  "optimization_goal",
  "billing_event",
  "promoted_object",
  "start_time",
  "end_time",
];

export async function getAdsets(
  args: z.infer<typeof getAdsetsSchema>,
): Promise<GraphListResponse<Adset>> {
  const params: Record<string, string | number> = {
    fields: fieldsParam(args.fields ?? DEFAULT_FIELDS) ?? "",
    limit: args.limit ?? 50,
  };
  if (args.status?.length) {
    params.effective_status = JSON.stringify(args.status);
  }
  const path = args.campaign_id
    ? `${args.campaign_id}/adsets`
    : `${resolveAccountId(args.account_id)}/adsets`;
  return graphGet<GraphListResponse<Adset>>(path, params);
}
