// Shared validation for seller product create/edit — imported by both the
// client-side form (for immediate feedback) and the API routes (as the
// authoritative check), same pattern as lib/validation/sellerSignup.ts.

export const MIN_PRODUCT_PHOTOS = 2;
export const MAX_PRODUCT_PHOTOS = 6;

export interface ProductInput {
  title: string;
  description: string;
  priceCents: number;
  shippingCostCents: number;
  offersLocalPickup?: boolean;
  dimensions?: string;
  weightGrams?: number;
  inventoryCount: number;
  categoryId: string;
  proofOfHandcraftedUrl: string;
  photoUrls: string[];
}

function assetHosts(): { cdnHost: string | null; vettingHost: string | null } {
  const cdn = process.env.PHOTOS_CDN_DOMAIN?.trim().replace(/\/$/, "") || null;
  const bucket = process.env.SELLER_VETTING_BUCKET_NAME?.trim();
  const region = (process.env.AWS_REGION || process.env.COGNITO_REGION || "").trim();
  const vettingHost = bucket && region ? `${bucket}.s3.${region}.amazonaws.com` : null;
  return { cdnHost: cdn ? cdn.replace(/^https?:\/\//, "") : null, vettingHost };
}

function hostAndPrefix(value: string, host: string | null, keyPrefix: string): boolean {
  if (!host) return false;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:") return false;
    if (url.hostname !== host) return false;
    const path = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    return path.startsWith(`${keyPrefix}/`);
  } catch {
    return false;
  }
}

function pathIncludesUser(value: string, userId: string): boolean {
  try {
    const path = decodeURIComponent(new URL(value.trim()).pathname);
    return path.includes(`/${userId}/`);
  } catch {
    return false;
  }
}

export function isAllowedProductPhotoUrl(value: string, ownerUserId?: string): boolean {
  const ok = hostAndPrefix(value, assetHosts().cdnHost, "product-photos");
  if (!ok) return false;
  if (ownerUserId && !pathIncludesUser(value, ownerUserId)) return false;
  return true;
}

export function isAllowedProofUrl(value: string, ownerUserId?: string): boolean {
  const ok = hostAndPrefix(value, assetHosts().vettingHost, "proof-of-handcrafted");
  if (!ok) return false;
  if (ownerUserId && !pathIncludesUser(value, ownerUserId)) return false;
  return true;
}

// The browser bundle does not receive the bucket env vars, so the form's
// instant check stays a shape check. The API always enforces the host list.
function enforceAssetHosts(): boolean {
  if (typeof window === "undefined") return true;
  const hosts = assetHosts();
  return Boolean(hosts.cdnHost || hosts.vettingHost);
}

function isNonNegativeInt(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) && value >= 0;
}

/**
 * Validates a (possibly partial/untrusted) product create payload. Returns a
 * list of human-readable error messages; empty means valid.
 */
export function validateProductInput(
  input: Partial<ProductInput>,
  options?: { ownerUserId?: string },
): string[] {
  const errors: string[] = [];

  if (!input.title || !input.title.trim()) {
    errors.push("Title is required.");
  }

  if (!input.description || !input.description.trim()) {
    errors.push("Description is required.");
  }

  if (!isNonNegativeInt(input.priceCents) || input.priceCents <= 0) {
    errors.push("Price must be a positive amount.");
  }

  if (!isNonNegativeInt(input.shippingCostCents)) {
    errors.push("Shipping cost must be a non-negative amount.");
  }

  if (input.offersLocalPickup !== undefined && typeof input.offersLocalPickup !== "boolean") {
    errors.push("Offers local pickup must be true or false.");
  }

  if (input.weightGrams !== undefined && input.weightGrams !== null && !isNonNegativeInt(input.weightGrams)) {
    errors.push("Weight must be a non-negative whole number of grams.");
  }

  if (!isNonNegativeInt(input.inventoryCount)) {
    errors.push("Inventory count must be a non-negative whole number.");
  }

  if (!input.categoryId || !input.categoryId.trim()) {
    errors.push("Category is required.");
  }

  const checkHosts = enforceAssetHosts();
  if (!input.proofOfHandcraftedUrl || !input.proofOfHandcraftedUrl.trim()) {
    errors.push("A proof-of-handcrafted photo is required.");
  } else if (checkHosts && !isAllowedProofUrl(input.proofOfHandcraftedUrl, options?.ownerUserId)) {
    errors.push("The proof-of-handcrafted file must be uploaded to UpSycle.");
  }

  const photoUrls = (input.photoUrls ?? []).filter((u) => u.trim());
  if (photoUrls.length < MIN_PRODUCT_PHOTOS || photoUrls.length > MAX_PRODUCT_PHOTOS) {
    errors.push(`Between ${MIN_PRODUCT_PHOTOS} and ${MAX_PRODUCT_PHOTOS} product photos are required.`);
  } else if (checkHosts && photoUrls.some((u) => !isAllowedProductPhotoUrl(u, options?.ownerUserId))) {
    errors.push("Product photos must be uploaded to UpSycle.");
  }

  return errors;
}

/**
 * Validates an inventory-only PATCH payload: exactly one of an absolute
 * `inventoryCount` (set-to-value) or a relative `inventoryDelta`
 * (increment/decrement) must be present.
 */
export function validateInventoryAdjustment(input: {
  inventoryCount?: unknown;
  inventoryDelta?: unknown;
}): string[] {
  const errors: string[] = [];
  const hasCount = input.inventoryCount !== undefined;
  const hasDelta = input.inventoryDelta !== undefined;

  if (hasCount && hasDelta) {
    errors.push("Provide either inventoryCount or inventoryDelta, not both.");
    return errors;
  }

  if (hasCount && !isNonNegativeInt(input.inventoryCount)) {
    errors.push("Inventory count must be a non-negative whole number.");
  }

  if (hasDelta && (typeof input.inventoryDelta !== "number" || !Number.isInteger(input.inventoryDelta))) {
    errors.push("Inventory adjustment must be a whole number.");
  }

  return errors;
}
