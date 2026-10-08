// Page for scripts/csp-smoke.mjs: opens one fixture (?f=md or ?f=excalidraw) under the storage CSP.
import "@anyknown/ui/tokens.css";
import "../../src/styles.css";
import { createRoot } from "react-dom/client";
import { blobSource } from "../../src/contract/byte-source";
import { FileViewer } from "../../src/viewer/file-viewer";
import diagramText from "../fixtures/diagram.excalidraw?raw";
import mdText from "../fixtures/doc-with-diagrams.md?raw";

const md = new URLSearchParams(location.search).get("f") === "md";
const file = md
  ? { name: "doc-with-diagrams.md", source: blobSource(new Blob([mdText])) }
  : { name: "diagram.excalidraw", source: blobSource(new Blob([diagramText])) };

createRoot(document.getElementById("root")!).render(
  <div style={{ height: "100vh" }}>
    <FileViewer file={file} excalidraw={{ assetPath: "/" }} onSave={async () => {}} />
  </div>,
);
