import { notFound, redirect } from "next/navigation";
import { browseHref, parseBrowseQuery } from "@/lib/browse";
import { getCategoryBySlug } from "@/lib/categories";

export const dynamic = "force-dynamic";

interface LegacyCategoryProps {
  params: Promise<{ categorySlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Older links used /category/jewelry. The shop now lives under /browse. */
export default async function LegacyCategoryRedirect({ params, searchParams }: LegacyCategoryProps) {
  const { categorySlug } = await params;
  const category = await getCategoryBySlug(categorySlug);
  if (!category || category.parentId !== null) notFound();
  redirect(browseHref(`/browse/${category.slug}`, parseBrowseQuery(await searchParams)));
}
