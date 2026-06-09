import { z } from "zod";
import { fieldsParam, graphGet } from "../graph-client.js";

export const getAdAccountsSchema = z.object({
  fields: z.array(z.string()).optional(),
  limit: z.number().int().min(1).max(100).optional().default(25),
});

const DEFAULT_FIELDS = [
  "id",
  "account_id",
  "name",
  "account_status",
  "currency",
  "timezone_name",
  "amount_spent",
  "balance",
  "business",
  "disable_reason",
];

type AdAccount = {
  id: string;
  account_id: string;
  name: string;
  account_status: number;
  currency: string;
  timezone_name?: string;
  amount_spent?: string;
  balance?: string;
};

export async function getAdAccounts(
  args: z.infer<typeof getAdAccountsSchema>,
): Promise<{ data: AdAccount[] }> {
  return graphGet<{ data: AdAccount[] }>("me/adaccounts", {
    fields: fieldsParam(args.fields ?? DEFAULT_FIELDS) ?? "",
    limit: args.limit ?? 25,
  });
}
