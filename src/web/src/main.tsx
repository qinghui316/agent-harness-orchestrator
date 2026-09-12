import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { DesktopUpdateBoundary } from "./shell/DesktopUpdateBoundary.js";
import "./styles/index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <DesktopUpdateBoundary><App /></DesktopUpdateBoundary>
  </StrictMode>,
);
