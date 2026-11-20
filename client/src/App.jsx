import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppDataProvider } from './context/AppDataContext';
import Sidebar from './components/Sidebar';
import MobileNav from './components/MobileNav';
import PasskeyPrompt from './components/PasskeyPrompt';
import NotifyPrompt from './components/NotifyPrompt';
import Toast from './components/Toast';
import InstallSheet from './components/InstallSheet';
import useIsMobile from './hooks/useIsMobile';

import Login from './pages/Login';
import Home from './pages/Home';
import MyTips from './pages/MyTips';
import TipEntry from './pages/TipEntry';
import Scoreboard from './pages/Scoreboard';
import Stats from './pages/Stats';
import Results from './pages/Results';
import Leagues from './pages/Leagues';
import NoLeague from './pages/NoLeague';
import AdminOverview from './pages/admin/AdminOverview';
import AdminUsers from './pages/admin/AdminUsers';
import AdminScoring from './pages/admin/AdminScoring';
import AdminRaces from './pages/admin/AdminRaces';
import AdminResults from './pages/admin/AdminResults';
import AdminImport from './pages/admin/AdminImport';
import AdminData from './pages/admin/AdminData';
import AdminPolls from './pages/admin/AdminPolls';
import MobileAdmin from './pages/MobileAdmin';

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading">Loading…</div>;
  return user ? children : <Navigate to="/" replace />;
}

// League admins of the selected league, and the site manager.
function RequireAdmin({ children }) {
  const { user, loading, isLeagueAdmin, isSiteManager } = useAuth();
  if (loading) return <div className="loading">Loading…</div>;
  if (!user) return <Navigate to="/" replace />;
  if (!isLeagueAdmin && !isSiteManager) return <Navigate to="/home" replace />;
  return children;
}

// Pages for settings shared by every league (results, importing tips).
function RequireSiteManager({ children }) {
  const { user, loading, isSiteManager } = useAuth();
  if (loading) return <div className="loading">Loading…</div>;
  if (!user) return <Navigate to="/" replace />;
  if (!isSiteManager) return <Navigate to="/admin" replace />;
  return children;
}

function AppShell() {
  const { user, loading, activeLeague } = useAuth();
  const isMobile = useIsMobile();
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

  // Still checking a saved token — don't flash the login form at someone who's already signed in.
  if (loading) {
    return (
      <div className="login-bg auth-splash" role="status" aria-label="Checking your session">
        <div className="auth-splash-inner">
          <div className="brand-mark auth-splash-mark" />
          <div className="auth-splash-bar"><span /></div>
          <div className="auth-splash-label mono">Warming up</div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  // Signed in but removed from every league (or never joined one).
  if (!activeLeague) return <NoLeague />;

  // Keyed by league so switching leagues reloads every page's data.
  // Mobile mode: home, tips, results and leaderboard, plus a cut-down admin page
  // (lock times, joker round, fixing tips) — no desktop sidebar.
  if (isMobile) {
    return (
      <AppDataProvider key={activeLeague.id}>
        <div className="app app-mobile">
          <MobileNav setToast={setToast} />
          <main className="main mobile-main">
            <PasskeyPrompt setToast={setToast} />
            <NotifyPrompt setToast={setToast} />
            <Routes>
              <Route path="/home" element={<Home setToast={setToast} theme={theme} setTheme={setTheme} />} />
              <Route path="/tips" element={<MyTips />} />
              <Route path="/predict/:round" element={<TipEntry setToast={setToast} />} />
              <Route path="/results" element={<Results setToast={setToast} />} />
              <Route path="/scoreboard" element={<Scoreboard />} />
              <Route path="/stats" element={<Stats />} />
              <Route path="/leagues" element={<Leagues setToast={setToast} />} />
              <Route path="/admin" element={<RequireAdmin><MobileAdmin setToast={setToast} /></RequireAdmin>} />
              <Route path="*" element={<Navigate to="/home" replace />} />
            </Routes>
          </main>
        </div>
        <Toast msg={toast} />
      </AppDataProvider>
    );
  }

  return (
    <AppDataProvider key={activeLeague.id}>
      <div className="app">
        <Sidebar />
        <main className="main">
          <PasskeyPrompt setToast={setToast} />
          <NotifyPrompt setToast={setToast} />
          <Routes>
            <Route path="/" element={<Navigate to="/home" replace />} />
            <Route path="/home" element={<Home setToast={setToast} theme={theme} setTheme={setTheme} />} />
            <Route path="/tips" element={<MyTips />} />
            <Route path="/predict/:round" element={<TipEntry setToast={setToast} />} />
            <Route path="/results" element={<Results setToast={setToast} />} />
            <Route path="/scoreboard" element={<Scoreboard />} />
            <Route path="/stats" element={<Stats />} />
            <Route path="/leagues" element={<Leagues setToast={setToast} />} />

            <Route path="/admin" element={<RequireAdmin><AdminOverview /></RequireAdmin>} />
            <Route path="/admin/users" element={<RequireAdmin><AdminUsers setToast={setToast} /></RequireAdmin>} />
            <Route path="/admin/scoring" element={<RequireAdmin><AdminScoring setToast={setToast} /></RequireAdmin>} />
            <Route path="/admin/races" element={<RequireAdmin><AdminRaces setToast={setToast} /></RequireAdmin>} />
            <Route path="/admin/results" element={<RequireSiteManager><AdminResults setToast={setToast} /></RequireSiteManager>} />
            <Route path="/admin/import" element={<RequireSiteManager><AdminImport setToast={setToast} /></RequireSiteManager>} />
            <Route path="/admin/data"   element={<RequireAdmin><AdminData   setToast={setToast} /></RequireAdmin>} />
            <Route path="/admin/polls"  element={<RequireAdmin><AdminPolls  setToast={setToast} /></RequireAdmin>} />

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
        <InstallSheet />
      </AuthProvider>
    </BrowserRouter>
  );
}
