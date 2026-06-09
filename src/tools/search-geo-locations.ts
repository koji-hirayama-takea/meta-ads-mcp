import { z } from "zod";
import { graphGet } from "../graph-client.js";

export const searchGeoLocationsSchema = z.object({
  q: z.string().describe("Search query (city/region/country name)."),
  type: z
    .enum(["adgeolocation", "country", "region", "city", "zip", "geo_market", "electoral_district"])
    .default("adgeolocation")
    .describe("Lookup type. adgeolocation = combined, restricted by location_types."),
  location_types: z
    .array(z.enum(["country", "country_group", "region", "city", "zip", "geo_market", "electoral_district"]))
    .optional()
    .describe("Filter when type=adgeolocation. e.g. ['city']"),
  country_code: z
    .string()
    .optional()
    .describe("ISO country code to scope city/region/zip search. e.g. 'JP'"),
  limit: z.number().int().min(1).max(100).optional().default(25),
});

type GeoLocation = {
  key: string;
  name: string;
  type: string;
  country_code?: string;
  country_name?: string;
  region?: string;
  region_id?: number;
  supports_region?: boolean;
  supports_city?: boolean;
};

export async function searchGeoLocations(
  args: z.infer<typeof searchGeoLocationsSchema>,
): Promise<{ data: GeoLocation[] }> {
  const params: Record<string, string | number> = {
    type: args.type,
    q: args.q,
    limit: args.limit ?? 25,
  };
  if (args.location_types?.length) {
    params.location_types = JSON.stringify(args.location_types);
  }
  if (args.country_code) {
    params.country_code = args.country_code;
  }
  return graphGet<{ data: GeoLocation[] }>("search", params);
}
