import type { Instrumentation } from "next";

/** Any unhandled server error (pages, route handlers, server actions) → an email alert. */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const { alert } = await import("@/lib/monitoring/alert");
  const e = err as Error & { digest?: string };
  await alert({
    kind: "server error",
    message: e.message || String(err),
    where: `${request.method} ${request.path} (${context.routerKind}, ${context.routeType} ${context.routePath})`,
    detail: [e.digest && `digest ${e.digest}`, e.stack].filter(Boolean).join("\n"),
  });
};
