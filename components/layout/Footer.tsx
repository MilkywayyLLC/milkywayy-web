import { AppLink as Link } from "@/components/ui/AppLink";
import type { SiteSettings } from "@/content/types";
import { env } from "@/lib/env";
import { Logo } from "./Logo";
import { CookieSettings } from "@/components/tracking/CookieSettings";

/** Always dark, whatever the page tone (guide §4.1). */
export function Footer({ site }: { site: SiteSettings }) {
  const year = new Date().getFullYear();
  return (
    <footer className="ftr" data-tone="dark">
      <div className="w">
        <div className="ftr-grid">
          <div>
            <Logo tone="dark" />
            <p>{site.footerLine}</p>
          </div>
          <nav aria-labelledby="ftr-services">
            <h2 id="ftr-services">Services</h2>
            <ul>
              <li>
                <Link href="/production">Production</Link>
              </li>
              <li>
                <Link href="/property-shoots">Property shoots</Link>
              </li>
              <li>
                <Link href="/post-production">Post-production</Link>
              </li>
              <li>
                <Link href="/ai-avatars">AI avatars</Link>
              </li>
            </ul>
          </nav>
          <nav aria-labelledby="ftr-studio">
            <h2 id="ftr-studio">Studio</h2>
            <ul>
              <li>
                <Link href="/work">Work</Link>
              </li>
              <li>
                <Link href="/about">About</Link>
              </li>
              <li>
                <Link href="/contact">Contact</Link>
              </li>
            </ul>
          </nav>
          <nav aria-labelledby="ftr-follow">
            <h2 id="ftr-follow">Follow</h2>
            <ul>
              <li>
                <a href={site.instagram.url} target="_blank" rel="noopener noreferrer">
                  Instagram
                </a>
              </li>
              <li>
                <a href={site.linkedin.url} target="_blank" rel="noopener noreferrer">
                  LinkedIn
                </a>
              </li>
              <li>
                <a href={env.clientLoginUrl}>Client login</a>
              </li>
            </ul>
          </nav>
        </div>
        <div className="legal">
          <span>
            © {year} {site.company} · {site.licence}
          </span>
          <span style={{ display: "flex", gap: 16 }}>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
            <CookieSettings />
          </span>
        </div>
      </div>
    </footer>
  );
}
