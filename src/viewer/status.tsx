import type { ReactNode } from "react";
import type { ViewerErrorCode } from "../contract/errors";
import { commonMessages } from "../i18n/messages";
import { useT } from "../i18n/use-t";
import { AlertIcon, FileIcon } from "../primitives/glyphs";
import { Spinner } from "../primitives/spinner";
import { viewerMessages } from "./messages";

export type StatusKind = "loading" | ViewerErrorCode;

function toneOf(kind: StatusKind): "busy" | "info" | "error" {
  if (kind === "loading") return "busy";
  return kind === "unsupported" || kind === "too_large" ? "info" : "error";
}

export function Status(props: { kind: StatusKind; children?: ReactNode }): React.JSX.Element {
  const tv = useT(viewerMessages);
  const tc = useT(commonMessages);
  const { kind } = props;
  const tone = toneOf(kind);
  const title = kind === "loading" ? tv("viewer.loading") : tc(`error.${kind}`);
  const hint = kind === "loading" ? "" : tv("viewer.downloadHint");
  const role = tone === "error" ? "alert" : tone === "info" ? "status" : undefined;
  return (
    <div className="fv-status" data-tone={tone} role={role}>
      {kind === "loading" ? (
        <Spinner label={tv("viewer.loading")} />
      ) : tone === "info" ? (
        <FileIcon size="lg" />
      ) : (
        <AlertIcon size="lg" />
      )}
      <div>{title}</div>
      {hint ? <p>{hint}</p> : null}
      {props.children}
    </div>
  );
}
