import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";
import "katex/dist/katex.min.css";
import "./styles.css";

type ErrorBoundaryState = {
  hasError: boolean;
  errorMessage: string;
};

class AppErrorBoundary extends React.Component<React.PropsWithChildren, ErrorBoundaryState> {
  constructor(props: React.PropsWithChildren) {
    super(props);
    this.state = { hasError: false, errorMessage: "" };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, errorMessage: error.message || "Unknown runtime error" };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error("App runtime error:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: "1rem", fontFamily: "sans-serif" }}>
          <h2>Application Runtime Error</h2>
          <p>The page crashed during rendering. Please refresh and check browser console.</p>
          <pre style={{ whiteSpace: "pre-wrap", background: "#f8fafc", padding: "0.75rem" }}>
            {this.state.errorMessage}
          </pre>
        </div>
      );
    }

    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>
);
