import type { Metadata } from "next";
import { notFound } from "next/navigation";
import BrowseCatalog from "@/components/BrowseCatalog";
import { loadBrowsePage, loadCategoryPlacements, parseBrowseQuery } from "@/lib/browse";
import { getCategoryBySlug, getCategoryTree, isRetiredCategorySlug } from "@/lib/categories";

export const dynamic = "force-dynamic";

interface SubcategoryBrowseProps {
  params: Promise<{ category: string; subcategory: string }>;
  searchParams: Promise<{
    page?: string;
    q?: string;
    minPrice?: string;
    maxPrice?: string;
    sort?: string;
  }>;
}

async function loadSubcategory(categorySlug: string, subcategorySlug: string) {
  if (isRetiredCategorySlug(categorySlug) || isRetiredCategorySlug(subcategorySlug)) return null;
  const subcategory = await getCategoryBySlug(subcategorySlug);
  if (!subcategory?.parent || subcategory.parent.slug !== categorySlug) return null;
  return subcategory;
}

export async function generateMetadata({ params }: SubcategoryBrowseProps): Promise<Metadata> {
  const { category, subcategory: subcategorySlug } = await params;
  const subcategory = await loadSubcategory(category, subcategorySlug);
  if (!subcategory?.parent) return { title: "Category not found — UpSycle Market" };
  return {
    title: `${subcategory.name} — ${subcategory.parent.name} — UpSycle Market`,
    description: `Shop handmade and upcycled ${subcategory.name} in ${subcategory.parent.name}.`,
  };
}

export default async function SubcategoryBrowsePage({ params, searchParams }: SubcategoryBrowseProps) {
  const { category: categorySlug, subcategory: subcategorySlug } = await params;
  const subcategory = await loadSubcategory(categorySlug, subcategorySlug);
  if (!subcategory?.parent) notFound();

  const query = parseBrowseQuery(await searchParams);
  const categoryIds = [subcategory.id];
  const [categories, placements] = await Promise.all([
    getCategoryTree(),
    loadCategoryPlacements("SUBCATEGORY", subcategory.id, categoryIds, query),
  ]);
  const excludeIds = [...placements.featured, ...placements.highlighted].map((product) => product.id);
  const { products, totalCount, totalPages } = await loadBrowsePage({
    categoryIds,
    query,
    excludeIds,
  });

  return (
    <BrowseCatalog
      eyebrow={subcategory.parent.name}
      headingLead="Browsing"
      title={subcategory.name}
      breadcrumbs={[
        { label: "Browse", href: "/browse" },
        { label: subcategory.parent.name, href: `/browse/${subcategory.parent.slug}` },
        { label: subcategory.name },
      ]}
      categories={categories}
      path={`/browse/${subcategory.parent.slug}/${subcategory.slug}`}
      activeCategorySlug={subcategory.parent.slug}
      activeSubcategorySlug={subcategory.slug}
      query={query}
      featured={placements.featured}
      highlighted={placements.highlighted}
      products={products}
      totalCount={totalCount}
      totalPages={totalPages}
      emptyLabel={`No ${subcategory.name} listings match. Try the rest of ${subcategory.parent.name}, or clear the filters.`}
    />
  );
}
