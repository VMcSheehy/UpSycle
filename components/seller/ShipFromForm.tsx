"use client";

import { useState } from "react";

const labelClass =
  "mb-2 block text-[0.65rem] font-medium tracking-[0.13em] uppercase text-[var(--muted)]";
const inputClass =
  "w-full border border-[var(--border)] bg-[var(--panel2)] px-4 py-3 text-sm text-[var(--cream)] outline-none focus:border-[var(--rg-core)]";

export interface ShipFromValue {
  shipFromName: string | null;
  shipFromLine1: string | null;
  shipFromLine2: string | null;
  shipFromCity: string | null;
  shipFromState: string | null;
  shipFromPostalCode: string | null;
}

export default function ShipFromForm({ initial }: { initial: ShipFromValue }) {
  const [name, setName] = useState(initial.shipFromName ?? "");
  const [line1, setLine1] = useState(initial.shipFromLine1 ?? "");
  const [line2, setLine2] = useState(initial.shipFromLine2 ?? "");
  const [city, setCity] = useState(initial.shipFromCity ?? "");
  const [state, setState] = useState(initial.shipFromState ?? "");
  const [postalCode, setPostalCode] = useState(initial.shipFromPostalCode ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/sellers/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shipFrom: { name, line1, line2, city, state, postalCode },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.errors?.[0] ?? "Could not save the address.");
        return;
      }
      setMessage("Ship-from address saved.");
    } catch {
      setError("Could not reach the server.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="border border-[var(--border)] bg-[var(--charcoal)] p-6 md:p-8" id="ship-from">
      <h2 className="mb-2 font-serif text-xl text-[var(--cream)]">Ship-from address</h2>
      <p className="mb-5 text-[0.8rem] font-light text-[var(--muted2)]">
        Used once for every label. Buyers never see the street address.
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={labelClass} htmlFor="shipFromName">Name on the label</label>
          <input id="shipFromName" className={inputClass} value={name} onChange={(event) => setName(event.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass} htmlFor="shipFromLine1">Street</label>
          <input id="shipFromLine1" className={inputClass} value={line1} onChange={(event) => setLine1(event.target.value)} required />
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass} htmlFor="shipFromLine2">Apartment, studio (optional)</label>
          <input id="shipFromLine2" className={inputClass} value={line2} onChange={(event) => setLine2(event.target.value)} />
        </div>
        <div>
          <label className={labelClass} htmlFor="shipFromCity">City</label>
          <input id="shipFromCity" className={inputClass} value={city} onChange={(event) => setCity(event.target.value)} required />
        </div>
        <div>
          <label className={labelClass} htmlFor="shipFromState">State</label>
          <input id="shipFromState" className={inputClass} value={state} onChange={(event) => setState(event.target.value)} maxLength={2} required />
        </div>
        <div>
          <label className={labelClass} htmlFor="shipFromPostalCode">ZIP</label>
          <input id="shipFromPostalCode" className={inputClass} value={postalCode} onChange={(event) => setPostalCode(event.target.value)} required />
        </div>
      </div>
      {error ? <p className="mt-4 text-sm text-[#e58a8a]">{error}</p> : null}
      {message ? <p className="mt-4 text-sm text-[var(--success)]">{message}</p> : null}
      <button type="submit" className="btn-primary mt-5" disabled={saving}>
        {saving ? "Saving…" : "Save ship-from address"}
      </button>
    </form>
  );
}
