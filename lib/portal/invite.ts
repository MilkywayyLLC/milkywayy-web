/**
 * The invite people send from their own WhatsApp or email (no WhatsApp template needed): who
 * invited them where, and that signing in with this number/email takes them straight in.
 */
export function inviteText(
  accountName: string,
  name: string | null,
  viaPhone: boolean,
  origin: string,
) {
  return `Hi${name ? ` ${name.split(" ")[0]}` : ""}, you’ve been added to ${accountName} on the Milkywayy client portal. Sign in with ${viaPhone ? "this WhatsApp number" : "this email"} at ${origin}/portal/login and you’ll land straight in the account.`;
}

export function inviteLinks(
  text: string,
  subject: string,
  to: { phone?: string | null; email?: string | null },
) {
  return {
    whatsapp: to.phone
      ? `https://wa.me/${to.phone.replace(/^\+/, "")}?text=${encodeURIComponent(text)}`
      : undefined,
    email: to.email
      ? `mailto:${to.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`
      : undefined,
  };
}

/** The site's own origin from the request (works on previews, staging and milkywayy.com). */
export function originFrom(h: Headers) {
  const host = h.get("x-forwarded-host") ?? h.get("host");
  return host ? `${h.get("x-forwarded-proto") ?? "https"}://${host}` : "https://milkywayy.com";
}
