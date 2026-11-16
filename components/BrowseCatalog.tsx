import Link from "next/link";
import FilterPanel from "@/components/FilterPanel";
import ProductCard from "@/components/ProductCard";
import FeaturedBadge from "@/components/FeaturedBadge";
import type { CategoryNode } from "@/lib/categories";
import { browseHref, type BrowseProduct, type BrowseQuery } from "@/lib/browse";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BrowseCatalogProps {
  eyebrow: string;
  /** Visible page heading. The category or subcategory name, or a short phrase for the full catalog. */
  title: string;
  /** Words before the italicized title, e.g. "Browsing". */
  headingLead?: string;
  breadcrumbs: BreadcrumbItem[];
  categories: CategoryNode[];
  path: string;
  activeCategorySlug?: string;
  activeSubcategorySlug?: string;
  /** Subcategory chips. Only the top-level category page passes these. */
  subcategoryLinks?: { name: string; slug: string }[];
  query: BrowseQuery;
  featured: BrowseProduct[];
  highlighted: BrowseProduct[];
  products: BrowseProduct[];
  totalCount: number;
  totalPages: number;
  emptyLabel: string;
}

function PlacementRow({
  products,
  featured = false,
}: {
  products: BrowseProduct[];
  featured?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-px">
      {products.map((product) => (
        <div key={product.id} className="w-full sm:w-[calc(50%-1px)] xl:w-[calc(33.333%-1px)]">
          {featured ? <FeaturedBadge product={product} /> : <ProductCard product={product} />}
        </div>
      ))}
    </div>
  );
}

function Crumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-6 flex flex-wrap items-center gap-2 text-[0.68rem] uppercase tracking-[0.12em]">
      {items.map((item, index) => (
        <span key={`${item.label}-${index}`} className="flex items-center gap-2">
          {index > 0 && <span className="text-[#D9A188]">/</span>}
          {item.href ? (
            <Link href={item.href} className="text-[#D9A188] no-underline transition-colors hover:text-[#FFFFFF]">
              {item.label}
            </Link>
          ) : (
            <span className="text-[#FFFFFF]" aria-current="page">
              {item.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}

export default function BrowseCatalog({
  eyebrow,
  title,
  headingLead,
  breadcrumbs,
  categories,
  path,
  activeCategorySlug,
  activeSubcategorySlug,
  subcategoryLinks,
  query,
  featured,
  highlighted,
  products,
  totalCount,
  totalPages,
  emptyLabel,
}: BrowseCatalogProps) {
  const nothingToShow = totalCount === 0 && featured.length === 0 && highlighted.length === 0;
  const pieceLabel = totalCount === 1 ? "piece" : "pieces";
  const carriedFilters = {
    q: query.q,
    minPrice: query.minPrice,
    maxPrice: query.maxPrice,
    sort: query.sort,
  };

  return (
    <section className="px-6 py-28 md:px-14">
      <div className="sec-max">
        <Crumbs items={breadcrumbs} />
        <div className="eyebrow">{eyebrow}</div>
        <h1 className="sec-title">
          {headingLead ? (
            <>
              {headingLead} <em>{title}</em>
            </>
          ) : (
            <em>{title}</em>
          )}
        </h1>

        {subcategoryLinks && subcategoryLinks.length > 0 && activeCategorySlug && (
          <div className="mb-10 flex flex-wrap gap-2">
            <Link
              href={browseHref(`/browse/${activeCategorySlug}`, carriedFilters)}
              aria-current="page"
              className="border border-[#C78A6E] bg-[#C78A6E] px-4 py-2 text-[0.65rem] uppercase tracking-[0.1em] text-[#000000] no-underline"
            >
              All {title}
            </Link>
            {subcategoryLinks.map((child) => (
              <Link
                key={child.slug}
                href={browseHref(`/browse/${activeCategorySlug}/${child.slug}`, carriedFilters)}
                className="border border-[#C78A6E] bg-[#000000] px-4 py-2 text-[0.65rem] uppercase tracking-[0.1em] text-[#FFEBE4] no-underline transition-colors hover:bg-[#C78A6E] hover:text-[#000000]"
              >
                {child.name}
              </Link>
            ))}
          </div>
        )}

        <div className="mt-6 grid grid-cols-1 gap-10 lg:grid-cols-[220px_1fr]">
          <aside>
            <FilterPanel
              categories={categories}
              path={path}
              activeCategorySlug={activeCategorySlug}
              activeSubcategorySlug={activeSubcategorySlug}
              query={query}
            />
          </aside>

          <div>
            {featured.length > 0 && (
              <div className="mb-16">
                <div className="eyebrow">Hand-Selected Pieces</div>
                <h2 className="sec-title mb-8 text-[clamp(1.5rem,2.2vw,2.1rem)]">
                  Featured <em>in {title}</em>
                </h2>
                <PlacementRow products={featured} featured />
              </div>
            )}

            {highlighted.length > 0 && (
              <div className="mb-16">
                <div className="eyebrow">Promoted This Week</div>
                <h2 className="sec-title mb-8 text-[clamp(1.5rem,2.2vw,2.1rem)]">
                  Highlighted <em>Artists</em>
                </h2>
                <PlacementRow products={highlighted} />
              </div>
            )}

            {nothingToShow ? (
              <div className="border border-[#C78A6E] bg-[#000000] px-6 py-12 text-center">
                <p className="font-serif text-[1.6rem] text-[#FFFFFF]">Nothing here yet</p>
                <p className="mt-2 text-[0.9rem] font-light text-[#ECB7A9]">{emptyLabel}</p>
                <Link href="/browse" className="btn-secondary mt-6">
                  Browse everything
                </Link>
              </div>
            ) : (
              <>
                {products.length > 0 && (
                  <>
                    <p className="mb-4 text-[0.72rem] uppercase tracking-[0.12em] text-[#D9A188]">
                      {totalCount} {pieceLabel}
                    </p>
                    <div className="grid grid-cols-1 gap-px bg-[var(--border)] sm:grid-cols-2 xl:grid-cols-3">
                      {products.map((product) => (
                        <ProductCard key={product.id} product={product} />
                      ))}
                    </div>
                  </>
                )}

                {totalPages > 1 && (
                  <div className="mt-10 flex items-center justify-center gap-4">
                    {query.page > 1 ? (
                      <Link href={browseHref(path, query, query.page - 1)} className="btn-secondary">
                        Previous
                      </Link>
                    ) : (
                      <span />
                    )}
                    <span className="text-[0.7rem] uppercase tracking-[0.12em] text-[#D9A188]">
                      Page {query.page} of {totalPages}
                    </span>
                    {query.page < totalPages && (
                      <Link href={browseHref(path, query, query.page + 1)} className="btn-secondary">
                        Next
                      </Link>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
