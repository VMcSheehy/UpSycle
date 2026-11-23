"use client";

import { useState } from "react";

const inputClass =
  "w-full border border-[var(--border)] bg-[var(--panel2)] px-4 py-3 text-sm text-[var(--cream)] outline-none focus:border-[var(--rg-core)]";

export default function FreightQuoteForm({ productId }: { productId: string }) {
  const [buyerName, setBuyerName] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [message, setMessage] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/shipping/quote-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, buyerName, buyerEmail, postalCode, message }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not send the request.");
        return;
      }
      setDone(true);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setSending(false);
    }
  }

  if (done) {
    return <p className="text-[0.9rem] text-[var(--cream)]">The seller has your shipping request.</p>;
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3" id="freight-quote">
      <p className="text-[0.85rem] font-light text-[var(--muted2)]">
        This piece is oversized. Request a shipping quote and the seller will reply with a price.
      </p>
      <input className={inputClass} placeholder="Your name" value={buyerName} onChange={(event) => setBuyerName(event.target.value)} required />
      <input className={inputClass} type="email" placeholder="Email" value={buyerEmail} onChange={(event) => setBuyerEmail(event.target.value)} required />
      <input className={inputClass} placeholder="ZIP code" value={postalCode} onChange={(event) => setPostalCode(event.target.value)} required />
      <textarea className={inputClass} rows={3} placeholder="Anything the seller should know" value={message} onChange={(event) => setMessage(event.target.value)} />
      {error ? <p className="text-sm text-[#e58a8a]">{error}</p> : null}
      <button type="submit" className="btn-primary" disabled={sending}>
        {sending ? "Sending…" : "Request shipping quote"}
      </button>
    </form>
  );
}
