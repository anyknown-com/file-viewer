import type { EditorProps } from "../contract/editor";
import { ViewerRoot } from "../primitives/root";
import { EditorBody } from "./editor-body";

export type AudioEditorProps = EditorProps;

export function AudioEditor(props: AudioEditorProps): React.JSX.Element {
  return (
    <ViewerRoot
      locale={props.locale}
      messages={props.messages}
      theme={props.theme}
      limits={props.limits}
      onError={props.onError}
    >
      <EditorBody {...props} />
    </ViewerRoot>
  );
}
