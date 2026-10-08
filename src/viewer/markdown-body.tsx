import { MarkdownView } from "../markdown";
import type { BodyProps } from "./bodies";

export default function MarkdownBody({ loaded, viewer }: BodyProps): React.JSX.Element {
  return <MarkdownView source={loaded.text ?? ""} resolveImage={viewer.markdown?.resolveImage} />;
}
