"use client";

import { useState } from "react";

interface ShareLinkProps {
  /** Accessible name of the page being shared, used by the system share sheet. */
  title: string;
  /** Site path to share, such as /sellers/studio. Defaults to the current page. */
  path?: string;
}

async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    try {
      const input = document.createElement("textarea");
      input.value = value;
      input.setAttribute("readonly", "");
      input.style.position = "fixed";
      input.style.left = "-9999px";
      document.body.appendChild(input);
      input.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(input);
      return ok;
    } catch {
      return false;
    }
  }
}

/**
 * Share this shop or product link. Uses the device share sheet when the
 * browser offers one, and copies the link when it does not.
 */
export default function ShareLink({ title, path }: ShareLinkProps) {
  const [notice, setNotice] = useState<string | null>(null);
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);

  async function onShare() {
    const url = path ? new URL(path, window.location.origin).toString() : window.location.href;
    setFallbackUrl(null);

    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, url });
        setNotice(null);
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }

    const copied = await copyText(url);
    if (copied) {
      setNotice("Link copied");
      window.setTimeout(() => setNotice(null), 2000);
      return;
    }

    setFallbackUrl(url);
    setNotice("Copy this link");
  }

  return (
    <div className="inline-flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={onShare}
        className="border border-[#C78A6E] bg-transparent px-4 py-2 text-[0.62rem] font-semibold tracking-[0.14em] text-[#ECB7A9] uppercase transition-colors hover:bg-[#C78A6E] hover:text-[#000000]"
        aria-label={notice ?? `Share ${title}`}
      >
        {notice === "Link copied" ? "Link copied" : "Share"}
      </button>
      {fallbackUrl && (
        <input
          readOnly
          value={fallbackUrl}
          aria-label="Page link"
          onFocus={(event) => event.currentTarget.select()}
          className="w-full max-w-xs border border-[rgba(199,138,110,0.4)] bg-[#000000] px-3 py-2 text-[0.75rem] text-[#FFEBE4]"
        />
      )}
    </div>
  );
}
