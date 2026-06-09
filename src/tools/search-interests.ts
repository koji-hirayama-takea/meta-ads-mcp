import { z } from "zod";
import { graphGet } from "../graph-client.js";

export const searchInterestsSchema = z.object({
  q: z
    .string()
    .describe("Interest keyword (e.g. 'Marketing', 'Startups', '経営'). EN/JP both supported."),
  limit: z.number().int().min(1).max(100).optional().default(25),
});

type Interest = {
  id: string;
  name: string;
  audience_size_lower_bound?: number;
  audience_size_upper_bound?: number;
  path?: string[];
  topic?: string;
};

export async function searchInterests(
  args: z.infer<typeof searchInterestsSchema>,
): Promise<{ data: Interest[] }> {
  return graphGet<{ data: Interest[] }>("search", {
    type: "adinterest",
    q: args.q,
    limit: args.limit ?? 25,
  });
}
