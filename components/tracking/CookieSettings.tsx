"use client";

/** Footer link on every page that reopens the cookie choice. */
export function CookieSettings() {
  return (
    <button
      type="button"
      className="lnk-btn"
      onClick={() => dispatchEvent(new Event("mw:cookie-settings"))}
    >
      Cookie settings
    </button>
  );
}
