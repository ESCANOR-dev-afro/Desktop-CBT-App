import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("⚠️ React View Boundary caught an error:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-darkBorder rounded-2xl p-8 text-center space-y-4 max-w-xl mx-auto my-12 shadow-2xl transition-colors">
          <div className="w-14 h-14 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-2xl flex items-center justify-center mx-auto text-amber-600 dark:text-amber-400">
            <AlertTriangle className="w-7 h-7" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">View Rendering Notice</h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 max-w-md mx-auto leading-relaxed">
              An unexpected state transition occurred while loading this view section. Click below to re-initialize the console view.
            </p>
          </div>
          <button
            onClick={this.handleReset}
            className="px-4 py-2.5 rounded-xl bg-brand hover:bg-brand-600 text-white text-xs font-bold transition-all shadow-md inline-flex items-center space-x-2 brand-glow-sm cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Reset Console View</span>
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
