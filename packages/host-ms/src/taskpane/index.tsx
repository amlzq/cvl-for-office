/* global document, Office */
import { createRoot } from "react-dom/client";
import { App } from "@cvl/ui";
import { wordAdapter } from "../word/adapter";

Office.onReady(() => {
  const container = document.getElementById("container");
  if (container) {
    createRoot(container).render(<App host={wordAdapter} />);
  }
});
