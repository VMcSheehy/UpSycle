// Shared query helpers for /browse, /browse/[category], and
// /browse/[category]/[subcategory]. One place so price, search, sort, and
// the "approved seller + still in stock" rule can't drift between pages.
import type { PlacementPageType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { dollarsToCents } from "@/lib/format";
import { getActivePlacementPeriod, resolveFeaturedProduct } from "@/lib/placement";

export const BROWSE_PAGE_SIZE = 24;

export type BrowseSort = "newest" | "price-asc" | "price-desc";

export interface BrowseQuery {
  q?: string;
  minPrice?: string;
  maxPrice?: string;
  sort: BrowseSort;
  page: number;
}

type SearchParam = string | string[] | undefined;

function first(value: SearchParam): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();
  return trimmed ? trimmed : undefined;
}

export function parseBrowseQuery(sp: {
  q?: SearchParam;
  minPrice?: SearchParam;
  maxPrice?: SearchParam;
  sort?: SearchParam;
  page?: SearchParam;
}): BrowseQuery {
  const sortRaw = first(sp.sort);
  const sort: BrowseSort =
    sortRaw === "price-asc" || sortRaw === "price-desc" ? sortRaw : "newest";
  return {
    q: first(sp.q),
    minPrice: first(sp.minPrice),
    maxPrice: first(sp.maxPrice),
    sort,
    page: Math.max(1, Number.parseInt(first(sp.page) ?? "1", 10) || 1),
  };
}

export function browseOrderBy(sort: BrowseSort): Prisma.ProductOrderByWithRelationInput[] {
  if (sort === "price-asc") return [{ priceCents: "asc" }, { createdAt: "desc" }];
  if (sort === "price-desc") return [{ priceCents: "desc" }, { createdAt: "desc" }];
  return [{ createdAt: "desc" }];
}

export const productCardInclude = {
  photos: { orderBy: { position: "asc" as const }, take: 1 },
  sellerProfile: {
    include: { user: { select: { firstName: true, lastName: true, email: true } } },
  },
} satisfies Prisma.ProductInclude;

export type BrowseProduct = Prisma.ProductGetPayload<{ include: typeof productCardInclude }>;

/**
 * Public catalog rule: the seller is approved, and the listing still has
 * stock. Pending and suspended shops stay hidden. A sold-out piece is not
 * an active listing.
 */
export function publicListingWhere(opts: {
  categoryIds?: string[];
  q?: string;
  minPrice?: string;
  maxPrice?: string;
  excludeIds?: string[];
}): Prisma.ProductWhereInput {
  const where: Prisma.ProductWhereInput = {
    inventoryCount: { gt: 0 },
    sellerProfile: { approvalStatus: "APPROVED" },
  };

  if (opts.categoryIds && opts.categoryIds.length > 0) {
    where.categoryId = { in: opts.categoryIds };
  }
  if (opts.excludeIds && opts.excludeIds.length > 0) {
    where.id = { notIn: opts.excludeIds };
  }
  if (opts.q) {
    where.OR = [
      { title: { contains: opts.q, mode: "insensitive" } },
      { description: { contains: opts.q, mode: "insensitive" } },
    ];
  }

  const minCents = opts.minPrice ? dollarsToCents(opts.minPrice) : undefined;
  const maxCents = opts.maxPrice ? dollarsToCents(opts.maxPrice) : undefined;
  const price: Prisma.IntFilter = {};
  if (minCents !== undefined && Number.isFinite(minCents)) price.gte = minCents;
  if (maxCents !== undefined && Number.isFinite(maxCents)) price.lte = maxCents;
  if (price.gte !== undefined || price.lte !== undefined) {
    where.priceCents = price;
  }

  return where;
}

/** Path plus the filters worth keeping when someone changes category, page, or sort. */
export function browseHref(path: string, query: Partial<BrowseQuery>, page?: number): string {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.minPrice) params.set("minPrice", query.minPrice);
  if (query.maxPrice) params.set("maxPrice", query.maxPrice);
  if (query.sort && query.sort !== "newest") params.set("sort", query.sort);
  const targetPage = page ?? query.page;
  if (targetPage && targetPage > 1) params.set("page", String(targetPage));
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

function matchesTextAndPrice(product: BrowseProduct, query: BrowseQuery): boolean {
  if (query.q) {
    const needle = query.q.toLowerCase();
    const hay = `${product.title} ${product.description}`.toLowerCase();
    if (!hay.includes(needle)) return false;
  }
  const minCents = query.minPrice ? dollarsToCents(query.minPrice) : undefined;
  const maxCents = query.maxPrice ? dollarsToCents(query.maxPrice) : undefined;
  if (minCents !== undefined && Number.isFinite(minCents) && product.priceCents < minCents) return false;
  if (maxCents !== undefined && Number.isFinite(maxCents) && product.priceCents > maxCents) return false;
  return true;
}

/**
 * Highlighted Artists (paid slots) and lottery-featured pieces for one
 * category or subcategory page. Only pieces inside that category that also
 * pass the public-listing rule are returned, in placement order.
 */
export async function loadCategoryPlacements(
  pageType: Extract<PlacementPageType, "CATEGORY" | "SUBCATEGORY">,
  placementCategoryId: string,
  categoryIds: string[],
  query: BrowseQuery,
): Promise<{ featured: BrowseProduct[]; highlighted: BrowseProduct[] }> {
  const activePeriod = await getActivePlacementPeriod();
  if (!activePeriod) return { featured: [], highlighted: [] };

  const [winners, slots] = await Promise.all([
    prisma.lotteryWinner.findMany({
      where: { periodId: activePeriod.id, pageType, categoryId: placementCategoryId },
      orderBy: { rank: "asc" },
    }),
    prisma.featuredSlotPurchase.findMany({
      where: { periodId: activePeriod.id, pageType, categoryId: placementCategoryId },
      orderBy: { slotNumber: "asc" },
    }),
  ]);

  const featuredResolved = await Promise.all(
    winners.map((winner) =>
      resolveFeaturedProduct(winner.sellerProfileId, winner.featuredProductId, { categoryIds }),
    ),
  );
  const highlightedResolved = await Promise.all(
    slots.map((slot) =>
      resolveFeaturedProduct(slot.sellerProfileId, slot.featuredProductId, { categoryIds }),
    ),
  );

  const seen = new Set<string>();
  const take = (products: Array<BrowseProduct | null>) => {
    const kept: BrowseProduct[] = [];
    for (const product of products) {
      if (!product || seen.has(product.id) || !matchesTextAndPrice(product, query)) continue;
      seen.add(product.id);
      kept.push(product);
    }
    return kept;
  };

  return {
    featured: take(featuredResolved),
    highlighted: take(highlightedResolved),
  };
}

export async function loadBrowsePage(opts: {
  categoryIds?: string[];
  query: BrowseQuery;
  excludeIds?: string[];
}): Promise<{ products: BrowseProduct[]; totalCount: number; totalPages: number }> {
  const where = publicListingWhere({
    categoryIds: opts.categoryIds,
    q: opts.query.q,
    minPrice: opts.query.minPrice,
    maxPrice: opts.query.maxPrice,
    excludeIds: opts.excludeIds,
  });

  const [products, totalCount] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: browseOrderBy(opts.query.sort),
      skip: (opts.query.page - 1) * BROWSE_PAGE_SIZE,
      take: BROWSE_PAGE_SIZE,
      include: productCardInclude,
    }),
    prisma.product.count({ where }),
  ]);

  return {
    products,
    totalCount,
    totalPages: Math.max(1, Math.ceil(totalCount / BROWSE_PAGE_SIZE)),
  };
}
