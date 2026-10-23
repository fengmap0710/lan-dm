import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@/components/AuthProvider';
import { useAuth } from '@/components/auth-context';
import { Layout } from '@/components/Layout';
import LoginPage from '@/pages/LoginPage/LoginPage';
import DashboardPage from '@/pages/DashboardPage/DashboardPage';
import DevicesPage from '@/pages/DevicesPage/DevicesPage';
import RulesPage from '@/pages/RulesPage/RulesPage';
import TrafficPage from '@/pages/TrafficPage/TrafficPage';
import UsersPage from '@/pages/UsersPage/UsersPage';
import SettingsPage from '@/pages/SettingsPage/SettingsPage';
import NotFoundPage from '@/pages/NotFoundPage/NotFoundPage';

function RequireAuth({ children }: { children: ReactNode }) {
  const { ready, isLoggedIn } = useAuth();
  if (!ready) return null;
  if (!isLoggedIn) return <Navigate to="/login" replace />;
  return children;
}

function RequireAdmin({ children }: { children: ReactNode }) {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          element={
            <RequireAuth>
              <Layout />
            </RequireAuth>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="devices" element={<DevicesPage />} />
          <Route path="rules" element={<RulesPage />} />
          <Route path="traffic" element={<TrafficPage />} />
          <Route
            path="users"
            element={
              <RequireAdmin>
                <UsersPage />
              </RequireAdmin>
            }
          />
          <Route
            path="settings"
            element={
              <RequireAdmin>
                <SettingsPage />
              </RequireAdmin>
            }
          />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
