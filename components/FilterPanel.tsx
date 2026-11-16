import Link from "next/link";
import type { CategoryNode } from "@/lib/categories";
import { browseHref, type BrowseQuery } from "@/lib/browse";

interface FilterPanelProps {
  categories: CategoryNode[];
  /** Current page path, without a query string. The form submits here. */
  path: string;
  activeCategorySlug?: string;
  activeSubcategorySlug?: string;
  query: BrowseQuery;
}

const labelClass =
  "mb-2 block text-[0.65rem] font-medium tracking-[0.13em] uppercase text-[var(--muted)]";
const fieldClass =
  "w-full border border-[#C78A6E] bg-[#000000] px-3 py-2 text-sm text-[#FFEBE4] outline-none transition-colors placeholder:text-[#D9A188] focus:border-[#ECB7A9]";

/**
 * Category links go to /browse/[category] (and the subcategory under it).
 * Search, price, and sort stay on the page you're already on, so a filter
 * never dumps you back into the whole catalog.
 */
export default function FilterPanel({
  categories,
  path,
  activeCategorySlug,
  activeSubcategorySlug,
  query,
}: FilterPanelProps) {
  const preserved: Partial<BrowseQuery> = {
    q: query.q,
    minPrice: query.minPrice,
    maxPrice: query.maxPrice,
    sort: query.sort,
  };

  return (
    <div className="flex flex-col gap-8">
      <nav aria-label="Product categories" className="flex flex-col gap-4">
        <span className={labelClass}>Category</span>
        <Link
          href={browseHref("/browse", preserved)}
          className={`text-[0.8rem] no-underline transition-colors ${
            !activeCategorySlug ? "text-[#FFFFFF]" : "text-[#FFEBE4] hover:text-[#ECB7A9]"
          }`}
          aria-current={!activeCategorySlug ? "page" : undefined}
        >
          All categories
        </Link>
        {categories.map((cat) => {
          const parentActive = activeCategorySlug === cat.slug;
          return (
            <div key={cat.slug}>
              <Link
                href={browseHref(`/browse/${cat.slug}`, preserved)}
                className={`block font-serif text-[1.05rem] no-underline transition-colors ${
                  parentActive ? "text-[#ECB7A9]" : "text-[#FFFFFF] hover:text-[#ECB7A9]"
                }`}
                aria-current={parentActive && !activeSubcategorySlug ? "page" : undefined}
              >
                {cat.name}
              </Link>
              {cat.children && cat.children.length > 0 && (
                <ul className="mt-2 flex flex-col gap-1.5 border-l border-[#C78A6E] pl-4 list-none">
                  {cat.children.map((child) => {
                    const childActive = activeSubcategorySlug === child.slug;
                    return (
                      <li key={child.slug}>
                        <Link
                          href={browseHref(`/browse/${cat.slug}/${child.slug}`, preserved)}
                          className={`text-[0.8rem] no-underline transition-colors ${
                            childActive ? "text-[#FFFFFF]" : "text-[#D9A188] hover:text-[#FFFFFF]"
                          }`}
                          aria-current={childActive ? "page" : undefined}
                        >
                          {child.name}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </nav>

      <form action={path} method="GET" className="flex flex-col gap-6">
        <div>
          <label className={labelClass} htmlFor="browse-q">
            {activeCategorySlug ? "Search this category" : "Search"}
          </label>
          <input
            id="browse-q"
            type="search"
            name="q"
            defaultValue={query.q}
            placeholder="Title or description"
            className={fieldClass}
          />
        </div>

        <fieldset>
          <legend className={labelClass}>Price</legend>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <label className="sr-only" htmlFor="minPrice">
                Minimum price
              </label>
              <input
                id="minPrice"
                type="number"
                name="minPrice"
                min={0}
                step="0.01"
                placeholder="Min $"
                defaultValue={query.minPrice}
                className={fieldClass}
              />
            </div>
            <span className="text-[#D9A188]">–</span>
            <div className="flex-1">
              <label className="sr-only" htmlFor="maxPrice">
                Maximum price
              </label>
              <input
                id="maxPrice"
                type="number"
                name="maxPrice"
                min={0}
                step="0.01"
                placeholder="Max $"
                defaultValue={query.maxPrice}
                className={fieldClass}
              />
            </div>
          </div>
        </fieldset>

        <div>
          <label className={labelClass} htmlFor="browse-sort">
            Sort
          </label>
          <select
            id="browse-sort"
            name="sort"
            defaultValue={query.sort}
            className={fieldClass}
          >
            <option value="newest">Newest</option>
            <option value="price-asc">Price: low to high</option>
            <option value="price-desc">Price: high to low</option>
          </select>
        </div>

        <button type="submit" className="btn-secondary">
          Apply
        </button>
      </form>

      <Link
        href={path}
        className="text-[0.7rem] font-medium uppercase tracking-[0.12em] text-[#D9A188] no-underline transition-colors hover:text-[#FFFFFF]"
      >
        Clear filters
      </Link>
    </div>
  );
}
