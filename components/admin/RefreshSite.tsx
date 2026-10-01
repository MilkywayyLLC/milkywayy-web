"use client";

import { useState, useTransition } from "react";
import { refreshWholeSite } from "@/lib/admin/actions";

/** For changes made outside the admin (e.g. directly in Supabase). Saving here refreshes by itself. */
export function RefreshSite() {
  const [msg, setMsg] = useState<string>();
  const [pending, start] = useTransition();
  return (
    <div className="ad-btns" style={{ alignItems: "center" }}>
      <button
        type="button"
        className="ad-btn quiet"
        disabled={pending}
        onClick={() =>
          start(async () =>
            setMsg(
              (await refreshWholeSite()).ok ? "Refreshing every page now." : "Couldn't refresh.",
            ),
          )
        }
      >
        Refresh the whole site
      </button>
      <span className="ad-small ad-muted" role="status">
        {msg}
      </span>
    </div>
  );
}
