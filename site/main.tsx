import "@anyknown/ui/tokens.css";
import "@anyknown/file-viewer/styles.css";
import "@fontsource-variable/figtree";
import "@fontsource-variable/geist-mono";
import "@fontsource-variable/noto-sans-tc";
import "./main.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Site } from "./site";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Site />
  </StrictMode>,
);
