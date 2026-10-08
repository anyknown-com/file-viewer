import { useContext, useMemo, useState } from "react";
import { resolveLimits } from "../contract/limits";
import type { RootProps } from "../contract/props";
import { cx } from "./cx";
import { RootContext, type RootContextValue } from "./root-context";

export function ViewerRoot(props: RootProps): React.JSX.Element {
  const parent = useContext(RootContext);
  const [portal, setPortal] = useState<HTMLElement | null>(null);
  const { locale = "en", messages, limits: limitsProp, theme, onError } = props;
  const limits = useMemo(() => resolveLimits(limitsProp), [limitsProp]);
  const value = useMemo<RootContextValue>(
    () => ({
      locale,
      overrides: messages ?? {},
      limits,
      theme,
      portal,
      report: (e) => onError?.(e),
    }),
    [locale, messages, limits, theme, portal, onError],
  );

  if (parent) return <>{props.children}</>;

  return (
    <RootContext value={value}>
      <div className={cx("fv-root", props.className)} data-theme={theme} lang={locale}>
        {props.children}
        <div className="fv-portal" ref={setPortal} />
      </div>
    </RootContext>
  );
}
