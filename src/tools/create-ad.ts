import { z } from "zod";
import { graphPost, resolveAccountId } from "../graph-client.js";

export const createAdSchema = z
  .object({
    account_id: z.string().optional(),
    adset_id: z.string().describe("Parent adset ID."),
    name: z.string(),
    status: z.enum(["ACTIVE", "PAUSED"]).default("PAUSED"),
    creative_id: z.string().optional().describe("Existing creative to attach."),
    creative_spec: z
      .record(z.unknown())
      .optional()
      .describe("Inline creative spec — alternative to creative_id. Same shape as create_ad_creative input."),
    tracking_specs: z.array(z.record(z.unknown())).optional(),
    conversion_specs: z.array(z.record(z.unknown())).optional(),
  })
  .refine((a) => a.creative_id || a.creative_spec, {
    message: "Either creative_id or creative_spec is required.",
  });

export async function createAd(
  args: z.infer<typeof createAdSchema>,
): Promise<{ id: string }> {
  const account = resolveAccountId(args.account_id);
  const creative = args.creative_id
    ? { creative_id: args.creative_id }
    : args.creative_spec;

  const body: Record<string, unknown> = {
    name: args.name,
    adset_id: args.adset_id,
    status: args.status,
    creative,
  };
  if (args.tracking_specs) body.tracking_specs = args.tracking_specs;
  if (args.conversion_specs) body.conversion_specs = args.conversion_specs;

  return graphPost<{ id: string }>(`${account}/ads`, body);
}
