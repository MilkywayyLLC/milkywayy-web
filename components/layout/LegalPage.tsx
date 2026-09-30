import type { ReactNode } from "react";
import { SampleLabel } from "@/components/ui/SampleLabel";

/** Plain legal page layout (Privacy, Terms): title, updated date, draft notice, readable prose. */
export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <section className="sec" aria-labelledby="legal-title">
      <div className="w legal-doc">
        <span className="eb">Milkywayy LLC</span>
        <h1 className="d h2" id="legal-title">
          {title}
        </h1>
        <p className="fine">Last updated {updated}</p>
        {/* TODO(owner): have the final text reviewed before launch (CONTENT_TODO.md). */}
        <SampleLabel>Draft · to be reviewed before launch</SampleLabel>
        {children}
      </div>
    </section>
  );
}
