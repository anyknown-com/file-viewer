import { useCallback, useRef, useState } from "react";
import type { ViewerError } from "../contract/errors";
import type { FileViewerProps } from "../contract/props";
import { ViewerRoot } from "../primitives/root";
import { Boundary } from "./boundary";
import { EditBar } from "./edit-bar";
import { EditPane } from "./edit-pane";
import { editors } from "./editors";
import { resolve, type Resolved } from "./resolve";
import { Status } from "./status";
import { sourceKey, ViewPane } from "./view-pane";

function Content(props: {
  viewer: FileViewerProps;
  report: (e: ViewerError) => void;
}): React.JSX.Element {
  const { viewer, report } = props;
  const { file, limits, onSave } = viewer;
  const [editing, setEditing] = useState(false);
  const r = resolve(file, limits);
  const Editor = r.edit && onSave ? editors[r.edit] : undefined;
  const open = (): void => {
    setEditing(true);
    viewer.onEditingChange?.(true);
  };
  const close = (): void => {
    setEditing(false);
    viewer.onEditingChange?.(false);
    viewer.onDirtyChange?.(false);
  };
  if (editing && Editor && onSave) {
    return (
      <EditPane
        Editor={Editor}
        editorProps={{
          file,
          locale: viewer.locale,
          messages: viewer.messages,
          theme: viewer.theme,
          limits,
          onError: report,
          onSave,
          onClose: close,
          onDirtyChange: viewer.onDirtyChange,
          maxOutputBytes: viewer.editor?.maxOutputBytes,
          assets: viewer.editor?.assets,
        }}
        report={report}
      />
    );
  }
  return (
    <>
      {Editor ? <EditBar onEdit={open} /> : null}
      <ViewBody r={r} viewer={viewer} report={report} />
    </>
  );
}

function ViewBody(props: {
  r: Resolved;
  viewer: FileViewerProps;
  report: (e: ViewerError) => void;
}): React.JSX.Element {
  const { r } = props;
  const { file } = props.viewer;
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

/** Opens one file read-only, or with an editor when the kind has one and onSave is set. */
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
