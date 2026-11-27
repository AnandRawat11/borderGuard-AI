import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('IBVAP frontend render error', { error, errorInfo });
  }

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <main
        role="alert"
        className="flex min-h-screen w-full items-center justify-center bg-canvas px-6 py-12 text-txt-primary"
      >
        <section className="w-full max-w-lg rounded-rad border border-status-danger-border bg-surface p-8 text-center shadow-elevated">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-status-danger">
            Command console unavailable
          </p>
          <h1 className="mb-3 text-2xl font-semibold text-txt-primary">
            The interface needs to reload
          </h1>
          <p className="mb-6 text-sm leading-6 text-txt-secondary">
            A display component failed to render. Your backend data and stored evidence were not changed.
          </p>
          <button
            type="button"
            onClick={this.handleReload}
            className="rounded-rad bg-primary px-4 py-2 text-sm font-semibold text-primary-text transition-colors hover:bg-primary-hover"
          >
            Reload application
          </button>
        </section>
      </main>
    );
  }
}
