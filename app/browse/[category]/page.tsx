import type { Metadata } from "next";
import { notFound } from "next/navigation";
import BrowseCatalog from "@/components/BrowseCatalog";
import { loadBrowsePage, loadCategoryPlacements, parseBrowseQuery } from "@/lib/browse";
import { getCategoryBySlug, getCategoryTree } from "@/lib/categories";

export const dynamic = "force-dynamic";

interface CategoryBrowseProps {
  params: Promise<{ category: string }>;
  searchParams: Promise<{
    page?: string;
    q?: string;
    minPrice?: string;
    maxPrice?: string;
    sort?: string;
  }>;
}

async function loadTopLevel(slug: string) {
  const category = await getCategoryBySlug(slug);
  if (!category || category.parentId !== null) return null;
  return category;
}

export async function generateMetadata({ params }: CategoryBrowseProps): Promise<Metadata> {
  const { category: slug } = await params;
  const category = await loadTopLevel(slug);
  if (!category) return { title: "Category not found — UpSycle Market" };
  return {
    title: `${category.name} — UpSycle Market`,
    description: `Shop handmade and upcycled ${category.name} from approved UpSycle artists.`,
  };
}

export default async function CategoryBrowsePage({ params, searchParams }: CategoryBrowseProps) {
  const { category: slug } = await params;
  const category = await loadTopLevel(slug);
  if (!category) notFound();

  const query = parseBrowseQuery(await searchParams);
  const categoryIds = [category.id, ...category.children.map((child) => child.id)];
  const [categories, placements] = await Promise.all([
    getCategoryTree(),
    loadCategoryPlacements("CATEGORY", category.id, categoryIds, query),
  ]);
  const excludeIds = [...placements.featured, ...placements.highlighted].map((product) => product.id);
  const { products, totalCount, totalPages } = await loadBrowsePage({
    categoryIds,
    query,
    excludeIds,
  });

  return (
    <BrowseCatalog
      eyebrow="Shop by craft"
      headingLead="Browsing"
      title={category.name}
      breadcrumbs={[{ label: "Browse", href: "/browse" }, { label: category.name }]}
      categories={categories}
      path={`/browse/${category.slug}`}
      activeCategorySlug={category.slug}
      subcategoryLinks={category.children}
      query={query}
      featured={placements.featured}
      highlighted={placements.highlighted}
      products={products}
      totalCount={totalCount}
      totalPages={totalPages}
      emptyLabel={`No ${category.name} listings match. Try another category, or clear the filters.`}
    />
  );
}
