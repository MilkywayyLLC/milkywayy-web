"use client";

import { useId, useState } from "react";
import type { BeforeAfterPair } from "@/content/types";
import { BeforeAfter } from "@/components/media/BeforeAfter";
import { SampleLabel } from "@/components/ui/SampleLabel";
import { Tabs } from "@/components/ui/Tabs";

/** "Drag to compare." Tabs above the slider (Sky · Twilight · HDR), text beside it (guide §6.4). */
export function BeforeAfterGallery({ pairs }: { pairs: BeforeAfterPair[] }) {
  const uid = useId();
  const [active, setActive] = useState(pairs[0]?.id ?? "");
  const pair = pairs.find((p) => p.id === active) ?? pairs[0];
  if (!pair) return null;
  return (
    <div className="ba-gal">
      <div className="stack" style={{ gap: 0 }}>
        <Tabs
          label="Edit type"
          idPrefix={uid}
          flush
          options={pairs.map((p) => ({ value: p.id, label: p.tab }))}
          value={pair.id}
          onChange={setActive}
        />
        <div role="tabpanel" id={`${uid}-panel`} aria-labelledby={`${uid}-tab-${pair.id}`}>
          <BeforeAfter key={pair.id} pair={pair} />
        </div>
      </div>
      <div className="ba-side">
        <h3 className="d h3">{pair.title}</h3>
        <p>{pair.description}</p>
        {pair.sample && (
          <SampleLabel>Placeholder imagery · real before/after pairs go here</SampleLabel>
        )}
      </div>
    </div>
  );
}
