import type { Client } from "@/content/types";

/** "Trusted by" client names in display type (the rating lives in the reviews section). */
export function ProofStrip({ clients }: { clients: Client[]; rating?: number }) {
  if (!clients.length) return null;
  return (
    <div className="proof">
      <div className="w proof-in">
        <span className="eb">Trusted by</span>
        {/* Desktop: one static row. Phones: a slow one-line marquee, so the list is doubled
            (second copy hidden from assistive tech and from desktop). */}
        <div className="clients">
          <div className="clients-track">
            <div className="clients-row">
              {clients.map((c) => (
                <span key={c.id}>{c.name}</span>
              ))}
            </div>
            <div className="clients-row clients-dup" aria-hidden="true">
              {clients.map((c) => (
                <span key={c.id}>{c.name}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
