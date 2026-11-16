import { notFound, redirect } from "next/navigation";
import { browseHref, parseBrowseQuery } from "@/lib/browse";
import { getCategoryBySlug, isRetiredCategorySlug } from "@/lib/categories";

export const dynamic = "force-dynamic";

interface LegacySubcategoryProps {
  params: Promise<{ categorySlug: string; subcategorySlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Older links used /category/jewelry/jewelry-necklace. The shop now lives under /browse. */
export default async function LegacySubcategoryRedirect({
  params,
  searchParams,
}: LegacySubcategoryProps) {
  const { categorySlug, subcategorySlug } = await params;
  if (isRetiredCategorySlug(categorySlug)) notFound();
  const subcategory = await getCategoryBySlug(subcategorySlug);
  if (!subcategory?.parent || subcategory.parent.slug !== categorySlug) notFound();
  redirect(
    browseHref(
      `/browse/${subcategory.parent.slug}/${subcategory.slug}`,
      parseBrowseQuery(await searchParams),
    ),
  );
}
