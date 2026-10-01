import type { ReactNode } from "react";

/** On-page confirmation shown after any form saves a lead (guide §9.4). */
export function FormDone({
  title,
  text,
  reference,
  waUrl,
  children,
}: {
  title: string;
  text: string;
  reference: string;
  /** WhatsApp hand-off: a fallback link in case the app didn't open. */
  waUrl?: string;
  children?: ReactNode;
}) {
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="done" role="status">
        <b>{title}</b>
        <p className="muted" style={{ margin: 0 }}>
          {text}
        </p>
        <p className="fine">
          Ref #{reference}
          {waUrl && (
            <>
              {" · "}
              <a className="lnk" href={waUrl} target="_blank" rel="noopener noreferrer">
                WhatsApp didn&apos;t open? Open it here
              </a>
            </>
          )}
        </p>
      </div>
      {children}
    </div>
  );
}

/** Shown when sending fails: nothing typed is lost, and there are two other ways to reach us. */
export function FormError({
  message,
  waUrl,
  email,
}: {
  message: string;
  waUrl: string;
  email: string;
}) {
  return (
    <div className="form-error" role="alert">
      <b>{message}</b>
      <span>
        Your answers are still here, so you can try again, or{" "}
        <a className="lnk" href={waUrl} target="_blank" rel="noopener noreferrer">
          WhatsApp us
        </a>{" "}
        or email{" "}
        <a className="lnk" href={`mailto:${email}`}>
          {email}
        </a>
        .
      </span>
    </div>
  );
}
