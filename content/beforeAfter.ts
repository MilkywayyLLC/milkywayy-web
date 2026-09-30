import type { BeforeAfterPair } from "./types";

// TODO(owner): real before/after pairs (Sky, Twilight, HDR). Placeholders until supplied.
export const beforeAfter: BeforeAfterPair[] = [
  {
    id: "sky",
    tab: "Sky",
    title: "Sky replacement",
    description:
      "Grey or blown-out skies replaced with a natural blue sky that matches the light on the building.",
    before: { alt: "Villa exterior under a grey sky, before editing", placeholder: "villa-grey" },
    after: { alt: "Same villa with a clear blue sky, after editing", placeholder: "villa" },
    published: true,
    sortOrder: 1,
    sample: true,
  },
  {
    id: "twilight",
    tab: "Twilight",
    title: "Virtual twilight",
    description:
      "A daytime exterior turned into a dusk shot with warm windows and a glowing pool. The listing photo that gets the click.",
    before: { alt: "Villa exterior in daylight, before editing", placeholder: "villa" },
    after: { alt: "Same villa converted to twilight, after editing", placeholder: "villa-dusk" },
    published: true,
    sortOrder: 2,
    sample: true,
  },
  {
    id: "hdr",
    tab: "HDR",
    title: "HDR blending",
    description:
      "Bracketed exposures blended for bright rooms, clean window views, straight verticals and true colour.",
    before: { alt: "Dim living room, single exposure, before editing", placeholder: "interior" },
    after: { alt: "Same living room after HDR blending", placeholder: "interior" },
    placeholderBeforeFilter: "grayscale(.55) brightness(.78) contrast(.78) saturate(.7)",
    inHero: true,
    published: true,
    sortOrder: 3,
    sample: true,
  },
];
