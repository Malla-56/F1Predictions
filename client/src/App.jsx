import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppDataProvider } from './context/AppDataContext';
import Sidebar from './components/Sidebar';
import Toast from './components/Toast';

import Login from './pages/Login';
import Home from './pages/Home';
import MyTips from './pages/MyTips';
import TipEntry from './pages/TipEntry';
import Scoreboard from './pages/Scoreboard';
import Stats from './pages/Stats';
import Results from './pages/Results';
import AdminOverview from './pages/admin/AdminOverview';
import AdminUsers from './pages/admin/AdminUsers';
import AdminScoring from './pages/admin/AdminScoring';
import AdminRaces from './pages/admin/AdminRaces';
import AdminResults from './pages/admin/AdminResults';
import AdminImport from './pages/admin/AdminImport';
import AdminData from './pages/admin/AdminData';

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading">Loading…</div>;
  return user ? children : <Navigate to="/" replace />;
}

function RequireAdmin({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/" replace />;
  if (user.role !== 'admin') return <Navigate to="/home" replace />;
  return children;
}

function AppShell() {
  const { user } = useAuth();
  const [toast, setToast] = useState(null);
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.body.dataset.theme = theme;
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(t);
  }, [toast]);

  if (!user) {
    return (
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  return (
    <AppDataProvider>
      <div className="app">
        <Sidebar />
        <main className="main">
          <Routes>
            <Route path="/" element={<Navigate to="/home" replace />} />
            <Route path="/home" element={<Home setToast={setToast} theme={theme} setTheme={setTheme} />} />
            <Route path="/tips" element={<MyTips />} />
            <Route path="/predict/:round" element={<TipEntry setToast={setToast} />} />
            <Route path="/results" element={<Results setToast={setToast} />} />
            <Route path="/scoreboard" element={<Scoreboard />} />
            <Route path="/stats" element={<Stats />} />

            <Route path="/admin" element={<RequireAdmin><AdminOverview /></RequireAdmin>} />
            <Route path="/admin/users" element={<RequireAdmin><AdminUsers setToast={setToast} /></RequireAdmin>} />
            <Route path="/admin/scoring" element={<RequireAdmin><AdminScoring setToast={setToast} /></RequireAdmin>} />
            <Route path="/admin/races" element={<RequireAdmin><AdminRaces setToast={setToast} /></RequireAdmin>} />
            <Route path="/admin/results" element={<RequireAdmin><AdminResults setToast={setToast} /></RequireAdmin>} />
            <Route path="/admin/import" element={<RequireAdmin><AdminImport setToast={setToast} /></RequireAdmin>} />
            <Route path="/admin/data"   element={<RequireAdmin><AdminData   setToast={setToast} /></RequireAdmin>} />

            <Route path="*" element={<Navigate to="/home" replace />} />
          </Routes>
        </main>
      </div>
      <Toast msg={toast} />
    </AppDataProvider>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </BrowserRouter>
  );
}
