import type { SiteSettings } from "@/content/types";
import { MediaFrame } from "@/components/media/MediaFrame";

/** Founder photo in a viewfinder frame + quote in sentence case (Archivo wdth 86). */
export function FounderBlock({ founder }: { founder: SiteSettings["founder"] }) {
  return (
    <div className="founder">
      <MediaFrame
        media={founder.photo}
        kind="founder"
        corners={false}
        clean
        sizes="(max-width: 820px) 420px, 40vw"
      />
      <div className="stack" style={{ gap: 24 }}>
        <span className="eb">From the founder</span>
        <blockquote>“{founder.quote}”</blockquote>
        <div className="sig">
          <span>
            <b>{founder.name}</b>
            {founder.role}
          </span>
        </div>
      </div>
    </div>
  );
}
