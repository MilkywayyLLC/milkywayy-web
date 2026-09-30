/** Dark-tone pages: Home, Production, Property shoots, /book, Work, About (guide §3). */
export default function DarkLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-tone="dark" className="tone-root">
      {children}
    </div>
  );
}
