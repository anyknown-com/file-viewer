import { Button as BaseButton } from "@base-ui/react/button";
import type { ReactNode } from "react";
import { cx } from "./cx";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonProps = Omit<React.ComponentProps<"button">, "children"> & {
  variant?: ButtonVariant;
  icon?: ReactNode;
} & ({ children: ReactNode } | { children?: undefined; "aria-label": string });

export function Button(props: ButtonProps): React.JSX.Element {
  const { variant = "secondary", icon, children, className, ...rest } = props;
  return (
    <BaseButton
      {...rest}
      className={cx(
        "fv-button",
        `fv-button-${variant}`,
        children === undefined && "fv-button-icon",
        className,
      )}
    >
      {icon}
      {children}
    </BaseButton>
  );
}
