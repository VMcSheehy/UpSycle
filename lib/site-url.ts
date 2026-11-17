// Stripe success and cancel URLs are built from this fixed origin. The
// request Origin header is not used: a buyer (or anyone who can call the
// checkout API) could otherwise send the shopper to a site they control
// after paying.
export function getSiteUrl(): string {
  const configured = process.env.SITE_URL?.trim();
  if (!configured) {
    throw new Error("SITE_URL is not configured.");
  }

  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new Error("SITE_URL must be an absolute URL.");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("SITE_URL must be an http or https URL.");
  }

  return url.origin;
}
