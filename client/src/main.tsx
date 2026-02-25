// client/src/main.tsx

import React from 'react';
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// The QueryClientProvider is already wrapping everything inside App.tsx,
// so it is not needed here. This simplifies the entry point.
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);