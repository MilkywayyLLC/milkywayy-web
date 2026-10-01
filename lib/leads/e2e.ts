import { createHmac } from "node:crypto";

/** Header value that marks a lead as an automated test (requires knowing LEAD_SECRET). */
export const e2eKey = (secret: string) =>
  createHmac("sha256", secret).update("milkywayy-e2e").digest("hex");
