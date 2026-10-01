import { ButtonLink } from "@/components/ui/Button";
import { WhatsAppIcon } from "@/components/ui/Icons";
import { pageWhatsappLink } from "@/lib/whatsapp";

/**
 * Phones only: WhatsApp icon + the page's main action, fixed to the bottom and clear of the home
 * indicator (guide §5). `inline` renders it in place for the styleguide.
 */
export function MobileActionBar({
  pageName,
  label,
  href,
  inline,
  whatsapp,
}: {
  whatsapp: string;
  pageName: string;
  label: string;
  href: string;
  inline?: boolean;
}) {
  return (
    <div className={inline ? "mbar-inline" : "mbar"}>
      <a
        className="icon-btn"
        href={pageWhatsappLink(pageName, whatsapp)}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="WhatsApp us"
      >
        <WhatsAppIcon size={20} />
      </a>
      <ButtonLink href={href}>{label}</ButtonLink>
    </div>
  );
}
