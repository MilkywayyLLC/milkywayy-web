/** Small line icons for the portal mockup (24px grid, 1.5px stroke, square caps). */
const P: Record<string, string> = {
  home: "M4 11 12 4l8 7v9h-5v-6H9v6H4z",
  shoots: "M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  editing: "M4 20h4L20 8l-4-4L4 16zM14 6l4 4",
  avatars: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c1-4 4-6 8-6s7 2 8 6",
  listings:
    "M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1",
  billing: "M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2zM9 8h6M9 12h6",
  team: "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20c.7-3 3-5 6-5s5.3 2 6 5M16 5a3 3 0 0 1 0 6M21 20c-.5-2.5-2-4-4-4.6",
  contacts: "M4 4h16v16H4zM12 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM7 18c.6-2 2.6-3 5-3s4.4 1 5 3",
  settings:
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12l2-1-2-4-2 1-2-1V5h-4v2l-2 1-2-1-2 4 2 1v2l-2 1 2 4 2-1 2 1v2h4v-2l2-1 2 1 2-4-2-1z",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  check: "M5 12l5 5L20 7",
  download: "M12 4v12M7 11l5 5 5-5M4 20h16",
  link: "M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1",
  plus: "M12 5v14M5 12h14",
  bell: "M6 16V11a6 6 0 1 1 12 0v5l2 2H4zM10 20h4",
  chevron: "M9 6l6 6-6 6",
  back: "M15 6l-6 6 6 6",
  close: "M6 6l12 12M18 6 6 18",
  phone: "M5 4h4l2 5-3 2a11 11 0 0 0 5 5l2-3 5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2",
  board: "M4 4h4v16H4zM10 4h4v10h-4zM16 4h4v13h-4z",
  play: "M8 5v14l11-7z",
};
export function Icon({
  name,
  size = 20,
  title,
}: {
  name: keyof typeof P | string;
  size?: number;
  title?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title && <title>{title}</title>}
      <path d={P[name] ?? ""} fill={name === "play" ? "currentColor" : "none"} />
    </svg>
  );
}
