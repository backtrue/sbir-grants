import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import { AuthProvider } from './contexts/AuthContext';
import OutOfCreditsModal from './components/OutOfCreditsModal';

const Home = lazy(() => import('./pages/Home'));
const Settings = lazy(() => import('./pages/Settings'));
const Projects = lazy(() => import('./pages/Projects'));
const ProjectDetails = lazy(() => import('./pages/ProjectDetails'));
const Login = lazy(() => import('./pages/Login'));

function RouteFallback() {
  return <div className="min-h-screen bg-slate-50" />;
}

function LegacyProjectRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={id ? `/app/projects/${id}` : '/app/projects'} replace />;
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/projects" element={<Navigate to="/app/projects" replace />} />
            <Route path="/projects/:id" element={<LegacyProjectRedirect />} />
            <Route path="/settings" element={<Navigate to="/app/settings" replace />} />
            <Route element={<ProtectedRoute />}>
              <Route path="/app" element={<Layout />}>
                <Route index element={<Home />} />
                <Route path="settings" element={<Settings />} />
                <Route path="projects" element={<Projects />} />
                <Route path="projects/:id" element={<ProjectDetails />} />
                <Route path="*" element={<Navigate to="/app" replace />} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <OutOfCreditsModal />
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
