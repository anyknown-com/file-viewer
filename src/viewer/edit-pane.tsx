import { Suspense, type ComponentType } from "react";
import type { EditorProps } from "../contract/editor";
import type { ViewerError } from "../contract/errors";
import { useT } from "../i18n/use-t";
import { Button } from "../primitives/button";
import { Boundary } from "./boundary";
import { viewerMessages } from "./messages";
import { Status } from "./status";

function EditFailure(props: { error: ViewerError; onClose: () => void }): React.JSX.Element {
  const tv = useT(viewerMessages);
  return (
    <div className="fv-stage">
      <Status kind={props.error.code}>
        <Button onClick={props.onClose}>{tv("viewer.back")}</Button>
      </Status>
    </div>
  );
}

export function EditPane(props: {
  Editor: ComponentType<EditorProps>;
  editorProps: EditorProps;
  report: (e: ViewerError) => void;
}): React.JSX.Element {
  const { Editor, editorProps, report } = props;
  return (
    <div className="fv-edit" role="presentation" onKeyDown={(e) => e.stopPropagation()}>
      <Boundary
        report={report}
        fallback={(e) => <EditFailure error={e} onClose={editorProps.onClose} />}
      >
        <Suspense
          fallback={
            <div className="fv-stage">
              <Status kind="loading" />
            </div>
          }
        >
          <Editor {...editorProps} />
        </Suspense>
      </Boundary>
    </div>
  );
}
