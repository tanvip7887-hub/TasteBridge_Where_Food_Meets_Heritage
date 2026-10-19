import React from "react";
import { AlertCircle, RefreshCw, Home } from "lucide-react";
import { Link } from "react-router-dom";

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("TasteBridge ErrorBoundary caught an error:", error, errorInfo);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[50vh] flex flex-col items-center justify-center p-6 text-center max-w-lg mx-auto space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center shadow-xs">
            <AlertCircle className="w-7 h-7" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-bold text-gray-900">Something went wrong</h3>
            <p className="text-sm text-gray-600">
              This page could not be displayed. Reload the page or return home and try again.
            </p>
          </div>
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={this.handleReload}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#D2552B] hover:bg-[#C4461C] text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Reload Page</span>
            </button>
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-xl text-xs font-semibold transition-all cursor-pointer"
            >
              <Home className="w-3.5 h-3.5" />
              <span>Return Home</span>
            </Link>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
