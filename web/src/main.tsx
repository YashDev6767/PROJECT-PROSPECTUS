import { MotionConfig } from "motion/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { ToastProvider } from "./components/ui/Toast";
import { AppProvider } from "./context/AppContext";
import { ThemeProvider } from "./context/ThemeContext";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
    <ThemeProvider>
    <BrowserRouter>
      <AppProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AppProvider>
    </BrowserRouter>
    </ThemeProvider>
    </MotionConfig>
  </StrictMode>,
);
