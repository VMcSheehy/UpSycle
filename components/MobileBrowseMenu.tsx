"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { CategoryNode } from "@/lib/categories";

/**
 * Touch-friendly Browse menu. The desktop menu opens on hover, which does
 * not work on a phone, so this one opens and closes with a button.
 */
export default function MobileBrowseMenu({ categories }: { categories: CategoryNode[] }) {
  const pathname = usePathname();
  // Remember which page the menu was opened on. A navigation changes the
  // path, so the menu closes without an effect writing state.
  const [openPath, setOpenPath] = useState<string | null>(null);
  const open = openPath === pathname;
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenPath(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpenPath(open ? null : pathname)}
        className="flex items-center gap-1.5 border border-[#C78A6E] bg-[#000000] px-3 py-2 text-[0.68rem] font-medium uppercase tracking-[0.13em] text-[#FFEBE4]"
      >
        Browse
        <svg width="8" height="6" viewBox="0 0 8 6" fill="none" aria-hidden="true">
          <path d="M1 1L4 4.5L7 1" stroke="#ECB7A9" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <div
          id={panelId}
          className="fixed inset-x-0 top-16 z-[190] max-h-[calc(100vh-4rem)] overflow-y-auto border-b border-[#C78A6E] bg-[#000000] px-6 py-5"
        >
          <Link
            href="/browse"
            className="mb-4 block text-[0.72rem] font-medium uppercase tracking-[0.12em] text-[#ECB7A9] no-underline"
          >
            All pieces
          </Link>
          <div className="flex flex-col gap-5">
            {categories.map((cat) => (
              <div key={cat.slug}>
                <Link
                  href={`/browse/${cat.slug}`}
                  className="block font-serif text-[1.15rem] text-[#FFFFFF] no-underline"
                >
                  {cat.name}
                </Link>
                {cat.children && cat.children.length > 0 && (
                  <ul className="mt-2 flex flex-col gap-1.5 list-none">
                    {cat.children.map((child) => (
                      <li key={child.slug}>
                        <Link
                          href={`/browse/${cat.slug}/${child.slug}`}
                          className="text-[0.85rem] text-[#D9A188] no-underline"
                        >
                          {child.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
