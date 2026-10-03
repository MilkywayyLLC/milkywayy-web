# V2 ideas (not built)

Ideas for after launch, written down so they don't get lost (owner, 3 Oct 2026). Same rules as the
site today: Viewfinder look, CSS and IntersectionObserver first, every motion respects
`prefers-reduced-motion`, no layout shift, and the page must stay fast (Lighthouse not lower).

## A. Workflow scroll section, per service

A pinned section that walks through how a job runs, one step at a time.

- **Layout:** the section pins for roughly one screen height per step. The current step sits large
  in the centre (number, title, two lines, a small UI fragment from the portal). The previous and
  next steps sit behind it, smaller, faded (~30%) and blurred (~6px), so you see where you came
  from and what's next.
- **The line:** a dotted line draws from the current step to the next as you scroll (an SVG path
  with `stroke-dasharray`, its offset driven by scroll progress). When it reaches the next step,
  that step comes forward and the old one recedes.
- **Per service:**
  - **Production:** Brief → Plan the month → Shoot days → Edit → Deliver → Statement.
  - **Property shoots:** Book online → Confirmed → Shoot → Photos in 24h → Revision → Share link.
  - **Post-production:** Upload or link → Files received → Edit in your saved style → Review →
    Revision → Deliver.
  - **AI avatars:** Brief → Design the look → Voice → Script approval → Production → Monthly videos.
- **Build notes:**
  - `position: sticky` with a tall wrapper; progress from one IntersectionObserver per step plus a
    passive scroll listener only while the section is on screen. CSS scroll-driven animations
    (`animation-timeline: view()`) where supported, falling back to the observer.
  - Blur on only three layers at most (blur is expensive on phones).
  - Reduced motion: no pinning; the steps as a plain numbered list with the dotted line drawn.
  - Phones: shorter pin (or none): one step per screen, swipe-friendly.
- **Risk:** scroll-jacking feels heavy if overdone. Keep the pin short and let a fast scroll pass
  through without fighting it.

## B. File intake animation ("genie into a folder")

For post-production: large file cards (RAW photos, a 4K clip, a drone shot) shrink and get pulled
into a folder, like the macOS genie effect: a vacuum, not a drop.

- **Look:** minimal, premium SaaS. Cream or black background, three to five file cards with real
  file names and sizes in mono (`IMG_3340.CR3 · 42 MB`), a simple folder labelled with the batch
  ("Willow Creek · October"). After the last card is in, the folder shows "42 files received" and
  the status chip flips to Files received.
- **Motion:** each card scales down and narrows towards the folder's mouth along a curve, staggered
  ~120ms. Use `transform` and `clip-path` only (GPU-friendly), about 700ms per card with a strong
  ease-in at the end (the "suck").
  - A true genie warp needs a mesh or canvas. A believable version: clip the card to a trapezoid
    that narrows towards the folder while it scales and translates.
- **Trigger:** once, when it scrolls into view. Replay on click.
- **Reduced motion:** the end state (folder with "42 files received"), no movement.
- **Where:** post-production hero or the "Send. Edit. Done." section; maybe the portal's empty state
  for a new batch.

## C. Subtle space and star theme

The name invites it; keep it quiet so it never fights the work.

- **Starfield on dark sections only:** a few hundred tiny dots in a single SVG or CSS
  `radial-gradient` background, very low opacity (5–12%), drifting a few pixels per minute.
  No canvas.
- **REC dot as a star:** the hero's REC dot pulses like a distant star (opacity only) instead of
  blinking.
- **Section dividers:** a thin dotted "orbit" arc behind the stats band; numbers sit on it like
  planets.
- **404 page:** "Lost in the Milkywayy": a slow star drift and a link home.
- **Cursor sparkle:** a few particles behind the cursor over the hero only, desktop only.
  Probably too much: test before shipping.
- **Rules:** never behind text that must be read; contrast checks still pass; turned off entirely
  with reduced motion; no new libraries.
