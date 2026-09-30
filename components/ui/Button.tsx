import { AppLink as Link } from "@/components/ui/AppLink";
import type { ComponentProps, ReactNode } from "react";
import { cx } from "@/lib/cx";

type Variant = "primary" | "ghost" | "link";

interface Common {
  variant?: Variant;
  size?: "md" | "sm";
  className?: string;
  children: ReactNode;
}

const classes = (variant: Variant, size: "md" | "sm", className?: string) =>
  cx(
    variant === "link" ? "lnk" : "btn",
    variant === "primary" && "btn-p",
    variant === "ghost" && "btn-g",
    variant !== "link" && size === "sm" && "btn-s",
    className,
  );

const isExternal = (href: string) => /^(https?:|mailto:|tel:)/.test(href);

/** Link styled as a button. External links open in a new tab. */
export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  className,
  children,
  ...rest
}: Common & { href: string } & Omit<ComponentProps<"a">, "href" | "className" | "children">) {
  const cls = classes(variant, size, className);
  if (isExternal(href)) {
    return (
      <a href={href} className={cls} target="_blank" rel="noopener noreferrer" {...rest}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={cls} {...rest}>
      {children}
    </Link>
  );
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  type = "button",
  ...rest
}: Common & Omit<ComponentProps<"button">, "className" | "children">) {
  return (
    <button type={type} className={classes(variant, size, className)} {...rest}>
      {children}
    </button>
  );
}
