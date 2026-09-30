"use client";

import { usePathname } from "next/navigation";
import { hasOwnMobileBar, mobileActionFor, pageNameFor } from "@/lib/pages";
import { MobileActionBar } from "./MobileActionBar";

/** Mobile action bar for the current route (label and target from lib/pages). */
export function PageMobileBar() {
  const path = usePathname();
  if (hasOwnMobileBar(path)) return null;
  const action = mobileActionFor(path);
  return <MobileActionBar pageName={pageNameFor(path)} label={action.label} href={action.href} />;
}
