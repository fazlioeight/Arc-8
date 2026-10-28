import React from 'react';

const RELOAD_FLAG_KEY = 'arc8.errorBoundary.reloadedForChunk';

const isChunkLoadError = (error) => {
  if (!error) return false;
  const name = error.name || '';
  const message = error.message || '';
  return (
    name === 'ChunkLoadError' ||
    /Loading chunk \d+ failed/i.test(message) ||
    /Loading CSS chunk \d+ failed/i.test(message) ||
    /Failed to fetch dynamically imported module/i.test(message)
  );
};

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
    this.handleReset = this.handleReset.bind(this);
    this.handleHardReload = this.handleHardReload.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    if (typeof window !== 'undefined') {
      // eslint-disable-next-line no-console
      console.error('Captured by ErrorBoundary', error, errorInfo);
    }

    // Chunk-load errors usually come from a stale main.js referencing
    // bundle chunks that no longer exist in the latest deploy. Force a
    // single hard reload so the browser fetches the new index.html +
    // matching chunks. sessionStorage flag prevents an infinite loop
    // if the new bundle still produces the same error.
    if (typeof window !== 'undefined' && isChunkLoadError(error)) {
      try {
        const alreadyReloaded = window.sessionStorage.getItem(RELOAD_FLAG_KEY);
        if (!alreadyReloaded) {
          window.sessionStorage.setItem(RELOAD_FLAG_KEY, String(Date.now()));
          window.location.reload();
        }
      } catch (e) {
        // sessionStorage may be unavailable (private mode + Safari); fall
        // through to the UI so the user can click "Reload page".
      }
    }
  }

  componentDidMount() {
    // If a previous boundary triggered an auto-reload and we mounted
    // successfully without hitting a fresh error, the bundle is fine
    // now -- clear the flag so a later chunk error can auto-reload again.
    if (typeof window !== 'undefined' && !this.state.hasError) {
      try { window.sessionStorage.removeItem(RELOAD_FLAG_KEY); } catch (e) { /* ignore */ }
    }
  }

  handleReset() {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (typeof this.props.onReset === 'function') {
      this.props.onReset();
    }
  }

  handleHardReload() {
    if (typeof window !== 'undefined') {
      try { window.sessionStorage.removeItem(RELOAD_FLAG_KEY); } catch (e) { /* ignore */ }
      window.location.reload();
    }
  }

  render() {
    if (this.state.hasError) {
      const {
        fallback,
        title = 'Something went wrong',
        description,
        actionLabel = 'Try again',
      } = this.props;

      if (fallback) {
        return fallback({
          error: this.state.error,
          errorInfo: this.state.errorInfo,
          resetError: this.handleReset,
        });
      }

      const chunkError = isChunkLoadError(this.state.error);
      const heading = chunkError ? 'Reloading the app' : title;
      const blurb = chunkError
        ? 'A newer version of the workspace is available. Reload to load the latest assets.'
        : (description || 'The page failed to load. You can retry or return to a safe location.');

      return (
        <div className="flex min-h-[60vh] items-center justify-center px-6 py-12">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-card dark:border-slate-700 dark:bg-slate-900">
            <h2 className="mb-3 text-lg font-semibold text-slate-900 dark:text-slate-100">
              {heading}
            </h2>
            <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">
              {blurb}
            </p>
            {this.state.error && !chunkError && (
              <pre className="mb-4 max-h-48 overflow-auto rounded-lg bg-slate-100 px-3.5 py-3 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                {this.state.error.message}
              </pre>
            )}
            <div className="flex flex-wrap gap-2">
              {chunkError ? (
                <button
                  type="button"
                  className="inline-flex items-center rounded-lg bg-[var(--brand-primary,#0a66c2)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-90"
                  onClick={this.handleHardReload}
                >
                  Reload page
                </button>
              ) : (
                <button
                  type="button"
                  className="inline-flex items-center rounded-lg bg-[var(--brand-primary,#0a66c2)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-90"
                  onClick={this.handleReset}
                >
                  {actionLabel}
                </button>
              )}
              <button
                type="button"
                className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-slate-500 dark:hover:bg-slate-700"
                onClick={() => window.location.assign('/')}
              >
                Go home
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
