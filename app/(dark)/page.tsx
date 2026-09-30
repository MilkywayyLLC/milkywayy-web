// Phase 0 staging page. Replaced by the real Home in Phase 2.
export default function Home() {
  return (
    <main id="main" className="grid min-h-dvh place-items-center px-6">
      <div className="grid gap-4 text-center">
        <p className="logo-mark justify-center">
          <i aria-hidden="true" />
          Milkywayy
        </p>
        <p className="text-muted font-mono text-xs tracking-[0.1em] uppercase">
          New site · staging build
        </p>
      </div>
    </main>
  );
}
