import type { Client } from "@/content/types";

/** "Trusted by" client names in display type + the Google rating (guide §4.5). */
export function ProofStrip({ clients, rating }: { clients: Client[]; rating: number }) {
  if (!clients.length) return null;
  return (
    <div className="proof">
      <div className="w proof-in">
        <span className="eb">Trusted by</span>
        <div className="clients">
          {clients.map((c) => (
            <span key={c.id}>{c.name}</span>
          ))}
        </div>
        <div className="rating">
          <b>{rating.toFixed(1)}</b>
          <div>
            <span className="stars" role="img" aria-label={`${rating} out of 5 stars`}>
              ★★★★★
            </span>
            <small>Google reviews</small>
          </div>
        </div>
      </div>
    </div>
  );
}
