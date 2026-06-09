import { z } from "zod";
import { fieldsParam, graphGet, resolveAccountId } from "../graph-client.js";

export const getAccountPagesSchema = z.object({
  account_id: z.string().optional(),
  fields: z.array(z.string()).optional(),
  limit: z.number().int().min(1).max(100).optional().default(50),
});

const DEFAULT_FIELDS = ["id", "name", "category", "tasks", "instagram_business_account"];

type AccountPage = {
  id: string;
  name?: string;
  category?: string;
  tasks?: string[];
  instagram_business_account?: { id: string };
};

export async function getAccountPages(
  args: z.infer<typeof getAccountPagesSchema>,
): Promise<{ data: AccountPage[] }> {
  const account = resolveAccountId(args.account_id);
  return graphGet<{ data: AccountPage[] }>(`${account}/promote_pages`, {
    fields: fieldsParam(args.fields ?? DEFAULT_FIELDS) ?? "",
    limit: args.limit ?? 50,
  });
}
