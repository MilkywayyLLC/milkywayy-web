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
  chat: "M4 5h16v11H9l-5 4zM8 9h8M8 12h5",
  chevron: "M9 6l6 6-6 6",
  back: "M15 6l-6 6 6 6",
  close: "M6 6l12 12M18 6 6 18",
  phone: "M5 4h4l2 5-3 2a11 11 0 0 0 5 5l2-3 5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2",
  board: "M4 4h4v16H4zM10 4h4v10h-4zM16 4h4v13h-4z",
  play: "M8 5v14l11-7z",
  person: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM5 20c.8-3.5 3.5-5 7-5s6.2 1.5 7 5",
  pin: "M12 21s-7-6.2-7-11a7 7 0 1 1 14 0c0 4.8-7 11-7 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  bed: "M3 18V6M3 14h18v4M21 14v-2a3 3 0 0 0-3-3h-7v5M7 11.5a1.5 1.5 0 1 0 0-.01",
  bath: "M4 12h16v3a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4zM6 12V6a2 2 0 0 1 4 0M7 19l-1 2M17 19l1 2",
  area: "M4 4h16v16H4zM4 9h5M15 4v5M9 20v-5M20 15h-5",
  sofa: "M4 11V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3M2 11h4v4h12v-4h4v7H2zM5 18v2M19 18v2",
  building: "M5 21V4h10v17M15 9h4v12M3 21h18M8 8h4M8 12h4M8 16h4",
  mail: "M3 5h18v14H3zM3 6l9 7 9-7",
  whatsapp:
    "M4 20l1.3-4A8 8 0 1 1 8 18.7zM9 9c0 3 3 6 6 6l1-1.5-2-1-1 .8c-1-.5-1.8-1.3-2.3-2.3l.8-1-1-2z",
  tour: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9s1-6.5 3.5-9z",
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  video: "M3 6h13v12H3zM16 10l5-3v10l-5-3z",
  photo: "M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6M15.5 9a1.5 1.5 0 1 0 0-.01",
  ai: "M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8zM18 15l.9 2.1L21 18l-2.1.9L18 21l-.9-2.1L15 18l2.1-.9z",
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
