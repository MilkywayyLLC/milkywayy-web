import { env } from "./env";

/** wa.me link with a message written from the client's side (guide §5). */
export function whatsappLink(text: string, number: string = env.whatsappNumber) {
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

/** Default page link: "Hi Milkywayy, I came from the {page} page." */
export function pageWhatsappLink(pageName: string) {
  return whatsappLink(`Hi Milkywayy, I came from the ${pageName} page.`);
}
