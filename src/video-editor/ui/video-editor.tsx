import type { EditorProps } from "../../contract/editor";
import { ViewerRoot } from "../../primitives/root";
import { VideoEditorBody } from "./editor-body";

export type VideoEditorProps = EditorProps;

export function VideoEditor(props: VideoEditorProps): React.JSX.Element {
  return (
    <ViewerRoot
      locale={props.locale}
      messages={props.messages}
      theme={props.theme}
      limits={props.limits}
      onError={props.onError}
    >
      <VideoEditorBody {...props} />
    </ViewerRoot>
  );
}
