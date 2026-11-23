// Presigned-upload helper backing three flows, split across two S3 buckets
// (see infra/lib/stacks/storage-stack.ts):
//  - "product-photos" -> the public product-photos bucket, fronted by
//    CloudFront (PHOTOS_CDN_DOMAIN) since the bucket itself blocks all
//    public access. fileUrl is a real, browser-loadable CDN URL.
//  - "seller-sample-photos" / "proof-of-handcrafted" -> the private
//    seller-vetting bucket (admin-review only, never public). fileUrl here
//    is a plain (non-loadable) S3 URL — a future admin-review feature must
//    re-sign a presigned GET from the stored key to actually view it.
//
// Uploads use a presigned POST so S3 itself enforces the content type and a
// content-length-range. The object key is scoped under the signed-in user.
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";

import { MAX_UPLOAD_BYTES, isVettingPrefix, type UploadPrefix } from "@/lib/upload-policy";

const REGION = process.env.AWS_REGION || process.env.COGNITO_REGION;
const PRODUCT_PHOTOS_BUCKET = process.env.PHOTOS_BUCKET_NAME;
const CDN_DOMAIN = process.env.PHOTOS_CDN_DOMAIN;
const VETTING_BUCKET = process.env.SELLER_VETTING_BUCKET_NAME;

function getClient(): S3Client {
  return new S3Client({ region: REGION });
}

export interface PresignedUpload {
  /** Browser POSTs the form fields, then the file, to this URL. */
  uploadUrl: string;
  fields: Record<string, string>;
  /** Object URL to store in Postgres once the upload succeeds — only
   * browser-loadable for the "product-photos" prefix (see module doc above). */
  fileUrl: string;
  key: string;
}

/** Issues a short-lived presigned POST for a single upload. */
export async function createPresignedUpload(
  contentType: string,
  extension: string,
  keyPrefix: UploadPrefix,
  userId: string,
): Promise<PresignedUpload> {
  const isVetting = isVettingPrefix(keyPrefix);
  const bucket = isVetting ? VETTING_BUCKET : PRODUCT_PHOTOS_BUCKET;

  if (!bucket) {
    throw new Error(
      isVetting ? "SELLER_VETTING_BUCKET_NAME is not configured" : "PHOTOS_BUCKET_NAME is not configured",
    );
  }
  if (!isVetting && !CDN_DOMAIN) {
    throw new Error("PHOTOS_CDN_DOMAIN is not configured");
  }
  if (!userId || userId.includes("/") || userId.includes("..")) {
    throw new Error("A valid user id is required to scope the upload key.");
  }

  const key = `${keyPrefix}/${userId}/${randomUUID()}.${extension}`;
  const client = getClient();
  const { url, fields } = await createPresignedPost(client, {
    Bucket: bucket,
    Key: key,
    Conditions: [
      ["content-length-range", 1, MAX_UPLOAD_BYTES],
      ["eq", "$Content-Type", contentType],
      ["eq", "$key", key],
    ],
    Fields: {
      "Content-Type": contentType,
      key,
    },
    Expires: 300,
  });

  const fileUrl = isVetting
    ? `https://${bucket}.s3.${REGION}.amazonaws.com/${key}`
    : `https://${CDN_DOMAIN}/${key}`;

  return { uploadUrl: url, fields, fileUrl, key };
}

/**
 * Re-signs a stored vetting-bucket `fileUrl` (seller sample photos,
 * proof-of-handcrafted) into a short-lived, browser-loadable GET URL — the
 * bucket itself blocks all public access, so the plain URL stored in
 * Postgres can't be used directly as an <img> src (see module doc above).
 * Admin-review-only; never call this for product-photos URLs (those are
 * already CDN-loadable).
 */
export async function presignVettingPhotoUrl(fileUrl: string): Promise<string> {
  if (!VETTING_BUCKET) {
    throw new Error("SELLER_VETTING_BUCKET_NAME is not configured");
  }

  const key = new URL(fileUrl).pathname.replace(/^\/+/, "");
  const client = getClient();
  const command = new GetObjectCommand({ Bucket: VETTING_BUCKET, Key: key });
  return getSignedUrl(client, command, { expiresIn: 900 });
}
