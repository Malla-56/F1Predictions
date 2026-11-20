import { createContext, useContext, useState, useEffect } from 'react';
import { api, setLeagueId } from '../api';
import { signInWithPasskey } from '../passkey';

const AuthContext = createContext(null);
const LEAGUE_KEY = 'leagueId';

function readLeagueId() {
  try { return Number(localStorage.getItem(LEAGUE_KEY)) || null; } catch { return null; }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [leagueId, setLeagueIdState] = useState(readLeagueId);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { setLoading(false); return; }
    api.auth.me()
      .then(setUser)
      // Only a rejected token logs you out — a network blip shouldn't.
      .catch(err => { if (err.status === 401 || err.status === 404) localStorage.removeItem('token'); })
      .finally(() => setLoading(false));
  }, []);

  // The selected league, falling back to the first one if the saved choice is gone.
  const leagues = user?.leagues || [];
  const activeLeague = leagues.find(l => l.id === leagueId) || leagues[0] || null;

  // Every API call sends the selected league; set it before children render and fetch.
  setLeagueId(activeLeague?.id ?? null);

  useEffect(() => {
    if (!activeLeague) return;
    try { localStorage.setItem(LEAGUE_KEY, String(activeLeague.id)); } catch { /* storage unavailable */ }
  }, [activeLeague?.id]);

  function switchLeague(id) {
    setLeagueIdState(id);
  }

  async function refresh() {
    const me = await api.auth.me();
    setUser(me);
    return me;
  }

  async function joinLeague(code) {
    const league = await api.leagues.join(code);
    await refresh();
    switchLeague(league.id);
    return league;
  }

  async function createLeague(name) {
    const league = await api.leagues.create(name);
    await refresh();
    switchLeague(league.id);
    return league;
  }

  async function login(username, password) {
    const { token, user } = await api.auth.login(username, password);
    localStorage.setItem('token', token);
    setUser(user);
    return user;
  }

  async function loginWithPasskey() {
    const { token, user } = await signInWithPasskey();
    localStorage.setItem('token', token);
    setUser(user);
    return user;
  }

  async function register(username, password, display_name, invite_code) {
    const { token, user } = await api.auth.register(username, password, display_name, invite_code);
    localStorage.setItem('token', token);
    setLeagueIdState(user.leagues?.[0]?.id ?? null);
    setUser(user);
    return user;
  }

  function logout() {
    localStorage.removeItem('token');
    setUser(null);
  }

  const isSiteManager = user?.role === 'site_manager';
  const isLeagueAdmin = activeLeague?.role === 'admin';

  return (
    <AuthContext.Provider value={{
      user, loading, login, loginWithPasskey, register, logout, refresh,
      leagues, activeLeague, switchLeague, joinLeague, createLeague,
      isSiteManager, isLeagueAdmin,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
