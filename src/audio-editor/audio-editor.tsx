import type { EditorProps } from "../contract/editor";
import { ViewerRoot } from "../primitives/root";
import { EditorBody } from "./editor-body";

/** Props of AudioEditor; the same as EditorProps. */
export type AudioEditorProps = EditorProps;

/** Audio editor: trim, adjust volume, normalize, remove silence, and export in another format. */
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
