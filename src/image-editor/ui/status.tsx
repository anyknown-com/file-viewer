// What the editor shows instead of the canvas: opening, or a message with a way back to the preview.
import { Button } from "../../primitives/button";
import { AlertIcon } from "../../primitives/glyphs";
import { Spinner } from "../../primitives/spinner";
import { useLabel } from "./use-label";

export function EditorStatus(
  props: { state: "loading" } | { state: "message"; text: string; onBack(): void },
): React.JSX.Element {
  const label = useLabel();
  if (props.state === "loading") {
    return (
      <div className="fv-status fv-ie-status" data-tone="busy">
        <Spinner label={label("image.open.loading")} />
      </div>
    );
  }
  return (
    <div className="fv-status fv-ie-status">
      <AlertIcon size="lg" />
      <p>{props.text}</p>
      <Button onClick={props.onBack}>{label("image.back")}</Button>
    </div>
  );
}
