import type { ReactNode } from "react";
import { LAUNCH } from "@/content/launch";
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
        {/* Until Akash confirms the legal review (content/launch.ts; a production build refuses). */}
        {!LAUNCH.legalReviewed && <SampleLabel>Draft · to be reviewed before launch</SampleLabel>}
        {children}
      </div>
    </section>
  );
}
