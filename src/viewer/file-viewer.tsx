import { useCallback, useRef } from "react";
import type { ViewerError } from "../contract/errors";
import type { FileViewerProps } from "../contract/props";
import { ViewerRoot } from "../primitives/root";
import { Boundary } from "./boundary";
import { resolve } from "./resolve";
import { Status } from "./status";
import { sourceKey, ViewPane } from "./view-pane";

function Content(props: {
  viewer: FileViewerProps;
  report: (e: ViewerError) => void;
}): React.JSX.Element {
  const { file, limits } = props.viewer;
  const r = resolve(file, limits);
  if (r.status !== "view") {
    return (
      <div className="fv-stage">
        <Status kind={r.status} />
      </div>
    );
  }
  return (
    <Boundary
      report={props.report}
      fallback={(e) => (
        <div className="fv-stage">
          <Status kind={e.code} />
        </div>
      )}
    >
      <ViewPane
        key={`${sourceKey(file.source)}:${r.view}`}
        file={file}
        view={r.view}
        viewer={props.viewer}
        report={props.report}
      />
    </Boundary>
  );
}

export function FileViewer(props: FileViewerProps): React.JSX.Element {
  const onErrorRef = useRef(props.onError);
  // oxlint-disable-next-line react/refs -- the one render-time ref write: keeps `report` stable so inline onError never reloads the file.
  onErrorRef.current = props.onError;
  const report = useCallback((e: ViewerError) => onErrorRef.current?.(e), []);
  return (
    <ViewerRoot
      locale={props.locale}
      messages={props.messages}
      theme={props.theme}
      limits={props.limits}
      onError={report}
      className="fv-viewer"
    >
      <Content viewer={props} report={report} />
    </ViewerRoot>
  );
}
