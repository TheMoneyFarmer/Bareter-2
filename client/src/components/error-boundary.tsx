import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RotateCcw, Home } from "lucide-react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  referenceId: string | null;
}

function makeReferenceId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    // fall through
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, referenceId: null };

  static getDerivedStateFromError(): Partial<ErrorBoundaryState> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    const referenceId = makeReferenceId();
    this.setState({ referenceId });

    const payload = {
      referenceId,
      message: String(error?.message ?? "Unknown error").slice(0, 1000),
      stack: String(error?.stack ?? "").slice(0, 4000),
      componentStack: String(info?.componentStack ?? "").slice(0, 4000),
      url: typeof window !== "undefined" ? window.location.href : "",
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
    };

    try {
      const body = JSON.stringify(payload);
      // Prefer fetch with keepalive so the report still flies if the user
      // immediately reloads. Fail silently — we never want the error
      // reporter itself to block the fallback UI.
      void fetch("/api/client-errors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        credentials: "include",
        keepalive: true,
      }).catch(() => {});
    } catch {
      // ignore
    }

    // Always log to the browser console too so devs see it in workspace.
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary]", referenceId, error, info?.componentStack);
  }

  private handleReload = () => {
    if (typeof window !== "undefined") window.location.reload();
  };

  private handleHome = () => {
    if (typeof window !== "undefined") window.location.assign("/");
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <section
        className="min-h-[70vh] flex items-center justify-center px-4 py-16"
        role="alert"
        aria-live="assertive"
        data-testid="page-error-boundary"
      >
        <div className="w-full max-w-xl text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-destructive/10 text-destructive mb-6">
            <AlertTriangle className="w-8 h-8" aria-hidden="true" />
          </div>
          <h1
            className="text-3xl sm:text-4xl font-bold text-foreground mb-3"
            data-testid="heading-error-boundary"
          >
            Something went wrong
          </h1>
          <p className="text-base text-muted-foreground mb-2 max-w-lg mx-auto">
            We hit an unexpected hiccup loading this page. Our team has been
            notified and we're looking into it.
          </p>
          {this.state.referenceId ? (
            <p className="text-xs text-muted-foreground mb-8">
              Reference id:{" "}
              <code
                className="font-mono px-1.5 py-0.5 rounded bg-muted"
                data-testid="text-error-reference-id"
              >
                {this.state.referenceId}
              </code>
            </p>
          ) : (
            <div className="mb-8" />
          )}
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button
              type="button"
              onClick={this.handleReload}
              className="gap-2"
              data-testid="button-error-reload"
            >
              <RotateCcw className="w-4 h-4" aria-hidden="true" />
              Reload page
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={this.handleHome}
              className="gap-2"
              data-testid="button-error-home"
            >
              <Home className="w-4 h-4" aria-hidden="true" />
              Go home
            </Button>
          </div>
        </div>
      </section>
    );
  }
}

export default ErrorBoundary;
