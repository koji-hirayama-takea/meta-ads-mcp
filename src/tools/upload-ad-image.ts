import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { z } from "zod";
import { graphPostMultipart, resolveAccountId } from "../graph-client.js";

export const uploadAdImageSchema = z
  .object({
    account_id: z.string().optional(),
    file_path: z.string().optional().describe("Absolute path to local image file."),
    base64: z.string().optional().describe("Base64-encoded image data. Alternative to file_path."),
    filename: z.string().optional().describe("Required when using base64. e.g. 'creative-v1.png'."),
  })
  .refine((a) => a.file_path || (a.base64 && a.filename), {
    message: "Provide either file_path, or both base64 and filename.",
  });

type UploadResponse = {
  images: Record<string, { hash: string; url: string; width?: number; height?: number }>;
};

export async function uploadAdImage(
  args: z.infer<typeof uploadAdImageSchema>,
): Promise<{ hash: string; url: string; width?: number; height?: number }> {
  const account = resolveAccountId(args.account_id);
  let buffer: Buffer;
  let filename: string;

  if (args.file_path) {
    buffer = readFileSync(args.file_path);
    filename = basename(args.file_path);
  } else {
    buffer = Buffer.from(args.base64 ?? "", "base64");
    filename = args.filename ?? "image";
  }

  const ext = filename.split(".").pop()?.toLowerCase();
  const contentType =
    ext === "png"
      ? "image/png"
      : ext === "jpg" || ext === "jpeg"
        ? "image/jpeg"
        : ext === "gif"
          ? "image/gif"
          : "application/octet-stream";

  const res = await graphPostMultipart<UploadResponse>(
    `${account}/adimages`,
    {},
    { [filename]: { filename, data: buffer, contentType } },
  );

  const firstKey = Object.keys(res.images)[0];
  if (!firstKey) throw new Error("Upload returned no image record.");
  return res.images[firstKey];
}
