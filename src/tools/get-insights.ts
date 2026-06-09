import { z } from "zod";
import { fieldsParam, graphGet, resolveAccountId } from "../graph-client.js";
import type { GraphListResponse, Insights } from "../types.js";

export const getInsightsSchema = z.object({
  level: z
    .enum(["account", "campaign", "adset", "ad"])
    .describe("Aggregation level."),
  object_id: z
    .string()
    .optional()
    .describe(
      'Required for level != "account". Pass campaign_id / adset_id / ad_id.',
    ),
  account_id: z
    .string()
    .optional()
    .describe('Required for level = "account". Defaults to META_DEFAULT_ACCOUNT_ID.'),
  date_preset: z
    .enum([
      "today",
      "yesterday",
      "this_month",
      "last_month",
      "this_quarter",
      "lifetime",
      "last_3d",
      "last_7d",
      "last_14d",
      "last_28d",
      "last_30d",
      "last_90d",
      "last_week_mon_sun",
      "last_week_sun_sat",
      "last_quarter",
      "last_year",
      "this_week_mon_today",
      "this_week_sun_today",
      "this_year",
    ])
    .optional()
    .default("last_7d"),
  time_range: z
    .object({ since: z.string(), until: z.string() })
    .optional()
    .describe('Overrides date_preset. Format: {"since":"YYYY-MM-DD","until":"YYYY-MM-DD"}.'),
  breakdowns: z.array(z.string()).optional().describe("e.g. ['age','gender']"),
  fields: z.array(z.string()).optional(),
  limit: z.number().int().min(1).max(500).optional().default(100),
});

const DEFAULT_FIELDS = [
  "impressions",
  "reach",
  "spend",
  "cpm",
  "cpc",
  "ctr",
  "frequency",
  "clicks",
  "actions",
  "action_values",
  "cost_per_action_type",
];

export async function getInsights(
  args: z.infer<typeof getInsightsSchema>,
): Promise<GraphListResponse<Insights>> {
  const path =
    args.level === "account"
      ? `${resolveAccountId(args.account_id)}/insights`
      : `${args.object_id}/insights`;

  if (args.level !== "account" && !args.object_id) {
    throw new Error('object_id is required when level is not "account".');
  }

  const params: Record<string, string | number> = {
    fields: fieldsParam(args.fields ?? DEFAULT_FIELDS) ?? "",
    limit: args.limit ?? 100,
  };
  if (args.time_range) {
    params.time_range = JSON.stringify(args.time_range);
  } else if (args.date_preset) {
    params.date_preset = args.date_preset;
  }
  if (args.breakdowns?.length) {
    params.breakdowns = args.breakdowns.join(",");
  }
  return graphGet<GraphListResponse<Insights>>(path, params);
}
