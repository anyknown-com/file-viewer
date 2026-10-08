import { DiagramBlock } from "../excalidraw/diagram-block";
import { MarkdownView } from "../markdown";
import type { BodyProps } from "./bodies";

export default function MarkdownBody({ loaded, viewer }: BodyProps): React.JSX.Element {
  return (
    <MarkdownView
      source={loaded.text ?? ""}
      resolveImage={viewer.markdown?.resolveImage}
      renderDiagram={(fence) => (
        <div className="fv-diagram-slot" data-fence={fence.index}>
          <DiagramBlock json={fence.json} assetPath={viewer.excalidraw?.assetPath} />
        </div>
      )}
    />
  );
}
