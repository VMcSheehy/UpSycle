// Issues a presigned S3 POST for one upload. The browser posts the file
// directly to S3, then sends the returned fileUrl to the signup or product API.
//
// Product photos (public bucket) require an approved seller. Vetting files
// (sample photos and proof of handcrafted) require a signed-in user, who may
// still be an applicant. Keys are scoped to that user, content types are
// limited, and S3 rejects anything over 10 MB.
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/current-user";
import { createPresignedUpload } from "@/lib/s3";
import { resolveSellerAuth } from "@/lib/seller-auth";
import {
  allowedContentTypes,
  authorizeUploadRequest,
  extensionForContentType,
  isUploadPrefix,
  type UploadPrefix,
} from "@/lib/upload-policy";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const { fileName, contentType, keyPrefix } = (body ?? {}) as {
    fileName?: unknown;
    contentType?: unknown;
    keyPrefix?: unknown;
  };

  if (typeof fileName !== "string" || !fileName.trim()) {
    return NextResponse.json({ error: "fileName is required." }, { status: 400 });
  }

  const resolvedPrefix: UploadPrefix = keyPrefix === undefined ? "seller-sample-photos" : (keyPrefix as UploadPrefix);
  if (typeof keyPrefix === "string" && !isUploadPrefix(keyPrefix)) {
    return NextResponse.json(
      { error: "keyPrefix must be one of: seller-sample-photos, product-photos, proof-of-handcrafted." },
      { status: 400 },
    );
  }
  if (keyPrefix !== undefined && typeof keyPrefix !== "string") {
    return NextResponse.json({ error: "keyPrefix must be a string." }, { status: 400 });
  }

  const user = await getCurrentUser();
  let isApprovedSeller = false;
  if (user && resolvedPrefix === "product-photos") {
    const auth = await resolveSellerAuth();
    isApprovedSeller = auth.ok;
  }

  const decision = authorizeUploadRequest({
    userId: user?.id ?? null,
    isApprovedSeller,
    keyPrefix: resolvedPrefix,
  });
  if (!decision.ok) {
    return NextResponse.json({ error: decision.error }, { status: decision.status });
  }

  const allowed = allowedContentTypes(resolvedPrefix);
  if (typeof contentType !== "string" || !allowed.includes(contentType)) {
    return NextResponse.json(
      { error: `contentType must be one of: ${allowed.join(", ")}.` },
      { status: 400 },
    );
  }

  const extension = extensionForContentType(contentType);
  if (!extension) {
    return NextResponse.json({ error: "That file type is not allowed." }, { status: 400 });
  }

  try {
    const presigned = await createPresignedUpload(contentType, extension, resolvedPrefix, decision.userId);
    return NextResponse.json(presigned);
  } catch (err) {
    console.error("Failed to create presigned upload URL:", err);
    return NextResponse.json({ error: "Failed to create upload URL." }, { status: 500 });
  }
}
