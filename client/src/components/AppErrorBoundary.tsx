import { Component, type ReactNode } from 'react';

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
};

export class AppErrorBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
  };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error('React render error', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-slate-900 to-slate-800 text-white">
          <div className="w-full max-w-md rounded-2xl border border-red-400/30 bg-red-500/10 p-6 text-center">
            <h1 className="text-2xl font-semibold">Unexpected UI error</h1>
            <p className="mt-3 text-sm text-red-100/90">
              The page failed to render correctly. Refresh the page and try again.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
