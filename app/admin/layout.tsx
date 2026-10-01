import type { Metadata } from "next";
import "./admin.css";

/** /admin: never indexed (also X-Robots-Tag from proxy.ts and Disallow in robots.txt). */
export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · Admin" },
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminRoot({ children }: { children: React.ReactNode }) {
  return (
    <div className="ad" data-tone="light">
      {children}
    </div>
  );
}
