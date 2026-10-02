import { getSiteSettings } from "@/lib/data";

/**
 * A tab whose features arrive in a later phase: says what will be here and how to get it done
 * today (WhatsApp, the chat number from Site settings).
 */
export async function Coming({
  eyebrow,
  title,
  what,
  today,
  ask,
}: {
  eyebrow: string;
  title: string;
  what: string;
  today: string;
  ask: string;
}) {
  const chat = await getSiteSettings()
    .then((s) => s.whatsapp.number)
    .catch(() => "");
  return (
    <>
      <div className="pt-head">
        <div>
          <span className="pt-eb">{eyebrow}</span>
          <h1 className="pt-h1">{title}</h1>
        </div>
      </div>
      <section className="pt-card">
        <b>Coming to your portal soon</b>
        <span className="pt-meta">{what}</span>
        <span>{today}</span>
        {chat && (
          <a
            className="btn btn-p btn-s"
            style={{ justifySelf: "start" }}
            href={`https://wa.me/${chat}?text=${encodeURIComponent(ask)}`}
            target="_blank"
            rel="noopener"
          >
            WhatsApp us
          </a>
        )}
      </section>
    </>
  );
}
