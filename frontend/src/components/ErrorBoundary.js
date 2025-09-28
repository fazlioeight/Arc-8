import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
    this.handleReset = this.handleReset.bind(this);
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
  }

  handleReset() {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (typeof this.props.onReset === 'function') {
      this.props.onReset();
    }
  }

  render() {
    if (this.state.hasError) {
      const { fallback, title = 'Something went wrong', description, actionLabel = 'Try again' } = this.props;

      if (fallback) {
        return fallback({
          error: this.state.error,
          errorInfo: this.state.errorInfo,
          resetError: this.handleReset,
        });
      }

      return (
        <div className="sfdc-portal" style={{ padding: '48px 24px', display: 'flex', justifyContent: 'center' }}>
          <div
            style={{
              maxWidth: 480,
              width: '100%',
              background: 'var(--sfdc-card, #fff)',
              borderRadius: 12,
              border: '1px solid var(--sfdc-border, #d8dde6)',
              padding: '32px 28px',
              boxShadow: 'var(--sfdc-shadow, 0 10px 30px rgba(13, 28, 61, 0.08))',
            }}
          >
            <h2 style={{ marginBottom: 12 }}>{title}</h2>
            <p style={{ color: 'var(--sfdc-text-subtle, #6b7280)', marginBottom: 16 }}>
              {description || 'The page failed to load. You can retry or return to a safe location.'}
            </p>
            {this.state.error && (
              <pre
                style={{
                  background: 'rgba(15, 23, 42, 0.05)',
                  padding: '12px 14px',
                  borderRadius: 8,
                  fontSize: '0.8rem',
                  overflowX: 'auto',
                  marginBottom: 16,
                }}
              >
                {this.state.error.message}
              </pre>
            )}
            <div style={{ display: 'flex', gap: 12 }}>
              <button type="button" className="sfdc-button_brand" onClick={this.handleReset}>
                {actionLabel}
              </button>
              <button type="button" className="sfdc-button_outline" onClick={() => window.location.assign('/') }>
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
