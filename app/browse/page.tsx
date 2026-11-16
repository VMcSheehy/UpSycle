import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import BrowseCatalog from "@/components/BrowseCatalog";
import { browseHref, loadBrowsePage, parseBrowseQuery } from "@/lib/browse";
import { getCategoryBySlug, getCategoryTree } from "@/lib/categories";

// Live product query — no DATABASE_URL at build time.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Browse — UpSycle Market",
  description: "Every handmade and upcycled piece from approved UpSycle artists.",
};

interface BrowsePageProps {
  searchParams: Promise<{
    cat?: string;
    page?: string;
    q?: string;
    minPrice?: string;
    maxPrice?: string;
    sort?: string;
  }>;
}

export default async function BrowsePage({ searchParams }: BrowsePageProps) {
  const sp = await searchParams;
  const query = parseBrowseQuery(sp);

  // Old links used /browse?cat=jewelry. Send them to the shareable category URL.
  if (sp.cat) {
    const category = await getCategoryBySlug(sp.cat);
    if (!category) notFound();
    const path = category.parent
      ? `/browse/${category.parent.slug}/${category.slug}`
      : `/browse/${category.slug}`;
    redirect(browseHref(path, query));
  }

  const categories = await getCategoryTree();
  const { products, totalCount, totalPages } = await loadBrowsePage({ query });

  return (
    <BrowseCatalog
      eyebrow={query.q ? "Search Results" : "Full Marketplace"}
      headingLead={query.q ? "Results for" : "Every"}
      title={query.q ? `“${query.q}”` : "one-of-a-kind piece"}
      breadcrumbs={[{ label: "Browse" }]}
      categories={categories}
      path="/browse"
      query={query}
      featured={[]}
      highlighted={[]}
      products={products}
      totalCount={totalCount}
      totalPages={totalPages}
      emptyLabel="No listings match that search. Try another word, or clear the filters."
    />
  );
}
