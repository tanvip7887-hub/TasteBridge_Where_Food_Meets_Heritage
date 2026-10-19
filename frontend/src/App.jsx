import AppRoutes from "./routes/AppRoutes.jsx";
import ErrorBoundary from "./components/common/ErrorBoundary.jsx";

function App() {
  return (
    <ErrorBoundary>
      <AppRoutes />
    </ErrorBoundary>
  );
}

export default App;
