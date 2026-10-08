import type { ReactNode } from "react";
import { cx } from "./cx";

export type IconSize = "sm" | "md" | "lg";

export function Icon(props: {
  size?: IconSize;
  label?: string;
  children: ReactNode;
}): React.JSX.Element {
  const { size = "md", label, children } = props;
  return (
    <svg
      className={cx("fv-icon", `fv-icon-${size}`)}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {children}
    </svg>
  );
}
