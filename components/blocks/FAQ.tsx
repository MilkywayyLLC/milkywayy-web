import type { Faq } from "@/content/types";
import { SampleLabel } from "@/components/ui/SampleLabel";

/**
 * Accessible accordion (<details>) + FAQPage JSON-LD for published, non-draft questions only
 * (guide §10). Drafts show a "draft" label.
 */
export function FAQ({ title, lede, faqs }: { title: string; lede?: string; faqs: Faq[] }) {
  if (!faqs.length) return null;
  const hasDraft = faqs.some((f) => f.draft);
  const final = faqs.filter((f) => !f.draft);
  const jsonLd = final.length
    ? {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: final.map((f) => ({
          "@type": "Question",
          name: f.question,
          acceptedAnswer: { "@type": "Answer", text: f.answer },
        })),
      }
    : null;

  return (
    <div className="faq">
      <div className="stack">
        <span className="eb">Questions</span>
        <h2 className="d h2">{title}</h2>
        {lede && <p className="lede">{lede}</p>}
      </div>
      <div className="faq-list">
        {hasDraft && (
          <SampleLabel className="mb-3">
            Draft questions · final list and answers to come
          </SampleLabel>
        )}
        {faqs.map((f) => (
          <details key={f.id}>
            <summary>{f.question}</summary>
            <p>{f.answer}</p>
          </details>
        ))}
      </div>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
        />
      )}
    </div>
  );
}
