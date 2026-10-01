import { readFileSync } from "node:fs";

/** Values from .env.local (Playwright doesn't load it). Test credentials live only there. */
export const env: Record<string, string> = (() => {
  try {
    return Object.fromEntries(
      readFileSync(".env.local", "utf8")
        .split("\n")
        .map((l) => /^([A-Z0-9_]+)=(.*)$/.exec(l.trim()))
        .filter((m): m is RegExpExecArray => !!m)
        .map((m) => [m[1], m[2]]),
    );
  } catch {
    return {};
  }
})();

export const hasAdminAccounts = !!(
  env.E2E_OWNER_EMAIL &&
  env.E2E_EDITOR_EMAIL &&
  env.E2E_STRANGER_EMAIL
);
