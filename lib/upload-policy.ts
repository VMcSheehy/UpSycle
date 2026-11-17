export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const IMAGE_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

// Proof-of-handcrafted and seller sample files live in the private vetting
// bucket. A PDF is allowed there because an applicant may submit a document
// rather than a photo. The public product-photo bucket stays images only.
export const VETTING_CONTENT_TYPES = [...IMAGE_CONTENT_TYPES, "application/pdf"] as const;

export const UPLOAD_PREFIXES = ["seller-sample-photos", "product-photos", "proof-of-handcrafted"] as const;

export type UploadPrefix = (typeof UPLOAD_PREFIXES)[number];

const EXTENSION_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

export function isUploadPrefix(value: string): value is UploadPrefix {
  return (UPLOAD_PREFIXES as readonly string[]).includes(value);
}

export function isVettingPrefix(prefix: UploadPrefix): boolean {
  return prefix === "seller-sample-photos" || prefix === "proof-of-handcrafted";
}

export function allowedContentTypes(prefix: UploadPrefix): readonly string[] {
  return prefix === "product-photos" ? IMAGE_CONTENT_TYPES : VETTING_CONTENT_TYPES;
}

export function extensionForContentType(contentType: string): string | null {
  return EXTENSION_BY_TYPE[contentType] ?? null;
}

export type UploadDecision =
  | { ok: true; userId: string }
  | { ok: false; status: 401 | 403; error: string };

// Product photos are public (via the CDN) and only an approved seller may
// request them. Vetting files stay private; any signed-in applicant or user
// may upload those, which is what seller signup needs before approval.
export function authorizeUploadRequest(input: {
  userId: string | null;
  isApprovedSeller: boolean;
  keyPrefix: UploadPrefix;
}): UploadDecision {
  if (!input.userId) {
    return { ok: false, status: 401, error: "Please sign in to upload a file." };
  }

  if (input.keyPrefix === "product-photos" && !input.isApprovedSeller) {
    return {
      ok: false,
      status: 403,
      error: "Only an approved seller can upload product photos.",
    };
  }

  return { ok: true, userId: input.userId };
}
