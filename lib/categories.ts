import { cache } from "react";
import { prisma } from "@/lib/prisma";

// Taxonomy used to seed `categories` (prisma/seed.ts) and the admin placement
// screen. Public browse navigation does NOT read this list — it loads the
// tree from the database via getCategoryTree(), so a category added in the
// database shows up without a code change.
//
// Category slugs are globally unique in the schema (`Category.slug @unique`),
// so subcategory slugs are prefixed with their parent (e.g. "jewelry-other"
// and "furniture-other" instead of two rows both named "other").

export interface CategoryNode {
  name: string;
  slug: string;
  children?: CategoryNode[];
}

// Clothing/Apparel was removed from the marketplace and from the production
// database. These slugs stay excluded so a leftover row can never reappear
// in the menu, the footer, or a browse URL.
const RETIRED_CATEGORY_SLUGS = ["clothing", "clothing-womens", "clothing-mens"] as const;

const retiredSlugList: string[] = [...RETIRED_CATEGORY_SLUGS];

// Display order for the original taxonomy. Anything newer still shows; it
// just sorts after these, by name. This is not the menu itself — the rows
// come from the database.
const PREFERRED_SLUG_ORDER = [
  "jewelry",
  "jewelry-necklace",
  "jewelry-earring",
  "jewelry-bracelet",
  "jewelry-other",
  "home-goods",
  "home-goods-woodworking",
  "home-goods-glassblowing",
  "home-goods-pottery",
  "home-goods-other",
  "furniture",
  "furniture-dresser",
  "furniture-table",
  "furniture-chair",
  "furniture-other",
];

function byPreferredSlug<T extends { slug: string; name: string }>(a: T, b: T): number {
  const ai = PREFERRED_SLUG_ORDER.indexOf(a.slug);
  const bi = PREFERRED_SLUG_ORDER.indexOf(b.slug);
  if (ai === -1 && bi === -1) return a.name.localeCompare(b.name);
  if (ai === -1) return 1;
  if (bi === -1) return -1;
  return ai - bi;
}

export function isRetiredCategorySlug(slug: string): boolean {
  return retiredSlugList.includes(slug);
}

/** Top-level categories and their subcategories, from the database. */
export const getCategoryTree = cache(async (): Promise<CategoryNode[]> => {
  const rows = await prisma.category.findMany({
    where: { parentId: null, slug: { notIn: retiredSlugList } },
    orderBy: { name: "asc" },
    include: {
      children: {
        where: { slug: { notIn: retiredSlugList } },
        orderBy: { name: "asc" },
        select: { name: true, slug: true },
      },
    },
  });

  return rows
    .map((row) => ({
      name: row.name,
      slug: row.slug,
      children: [...row.children].sort(byPreferredSlug),
    }))
    .sort(byPreferredSlug);
});

export const getCategoryBySlug = cache(async (slug: string) => {
  if (isRetiredCategorySlug(slug)) return null;
  const category = await prisma.category.findUnique({
    where: { slug },
    include: {
      parent: { select: { id: true, name: true, slug: true, parentId: true } },
      children: {
        where: { slug: { notIn: retiredSlugList } },
        orderBy: { name: "asc" },
        select: { id: true, name: true, slug: true },
      },
    },
  });
  if (!category) return null;
  return {
    ...category,
    children: [...category.children].sort(byPreferredSlug),
  };
});

export const CATEGORY_TREE: CategoryNode[] = [
  {
    name: "Jewelry",
    slug: "jewelry",
    children: [
      { name: "Necklaces", slug: "jewelry-necklace" },
      { name: "Earrings", slug: "jewelry-earring" },
      { name: "Bracelets", slug: "jewelry-bracelet" },
      { name: "Other", slug: "jewelry-other" },
    ],
  },
  {
    name: "Home Goods",
    slug: "home-goods",
    children: [
      { name: "Wood Working", slug: "home-goods-woodworking" },
      { name: "Glass Blowing", slug: "home-goods-glassblowing" },
      { name: "Pottery", slug: "home-goods-pottery" },
      { name: "Other", slug: "home-goods-other" },
    ],
  },
  {
    name: "Furniture",
    slug: "furniture",
    children: [
      { name: "Dressers", slug: "furniture-dresser" },
      { name: "Tables", slug: "furniture-table" },
      { name: "Chairs", slug: "furniture-chair" },
      { name: "Other", slug: "furniture-other" },
    ],
  },
];
