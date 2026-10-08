import { useCallback, useState } from "react";
import { ProjectError, readHead } from "../comp/index";
import type { FileRef } from "../contract/byte-source";
import { isAbortError, toViewerError, type ViewerError } from "../contract/errors";
import { useT } from "../i18n/use-t";
import { FileIcon } from "../primitives/glyphs";
import { Spinner } from "../primitives/spinner";
import { imageMessages } from "./messages";

type State = { status: "loading" } | { status: "preview"; url: string } | { status: "none" };

/** Shows a .comp.zip project's QuickLook preview, reading only the zip head. */
export default function CompPreview(props: {
  file: FileRef;
  fail?: (e: ViewerError) => void;
}): React.JSX.Element {
  const t = useT(imageMessages);
  const { file, fail } = props;
  const { source } = file;
  const [state, setState] = useState<State>({ status: "loading" });

  const stage = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node) return;
      const ctl = new AbortController();
      const { signal } = ctl;
      let url: string | null = null;
      setState({ status: "loading" });
      readHead((s, e) => source.read(s, e, signal)).then(
        (head) => {
          if (signal.aborted) return;
          if (!head?.preview) {
            setState({ status: "none" });
            return;
          }
          url = URL.createObjectURL(
            new Blob([new Uint8Array(head.preview)], { type: "image/jpeg" }),
          );
          setState({ status: "preview", url });
        },
        (e: unknown) => {
          if (signal.aborted || isAbortError(e)) return;
          if (e instanceof ProjectError) {
            setState({ status: "none" });
            return;
          }
          fail?.(toViewerError(e, "read_failed"));
        },
      );
      return () => {
        ctl.abort();
        if (url) URL.revokeObjectURL(url);
      };
    },
    [source, fail],
  );

  return (
    <div className="fv-comp-preview" ref={stage}>
      {state.status === "preview" ? (
        <img className="fv-image" src={state.url} alt={file.name} decoding="async" />
      ) : state.status === "none" ? (
        <output className="fv-status" data-tone="info">
          <FileIcon size="lg" />
          <div>{t("image.preview.none")}</div>
        </output>
      ) : (
        <div className="fv-status" data-tone="busy">
          <Spinner label={t("image.preview.loading")} />
        </div>
      )}
    </div>
  );
}
