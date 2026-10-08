import { DiagramBlock } from "../excalidraw/diagram-block";
import type { BodyProps } from "./bodies";

// No onEdit: editing a whole .excalidraw file goes through the top bar's Edit button.
export default function ExcalidrawBody({ loaded, viewer }: BodyProps): React.JSX.Element {
  return (
    <div className="fv-excalidraw">
      <DiagramBlock json={loaded.text ?? ""} assetPath={viewer.excalidraw?.assetPath} />
    </div>
  );
}
