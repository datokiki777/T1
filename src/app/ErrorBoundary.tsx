import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled runtime error:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#0d2342",
            color: "#f5f7fb",
            padding: 24,
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <div
            style={{
              maxWidth: 460,
              textAlign: "center",
              background: "#0b1d3f",
              border: "1px solid #ff6b6b",
              borderRadius: 12,
              padding: 24,
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 10 }}>
              ⚠️ Something went wrong
            </div>
            <div style={{ fontSize: 13, opacity: 0.75, marginBottom: 16, wordBreak: "break-word" }}>
              {this.state.error.message}
            </div>
            <button
              onClick={() => window.location.reload()}
              style={{
                background: "#ffc440",
                color: "#071633",
                border: "none",
                borderRadius: 8,
                padding: "8px 16px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Reload page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
