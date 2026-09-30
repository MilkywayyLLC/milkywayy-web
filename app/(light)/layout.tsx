/** Light-tone pages: Post-production, AI avatars, Contact, legal (guide §3). */
export default function LightLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-tone="light" className="tone-root">
      {children}
    </div>
  );
}
