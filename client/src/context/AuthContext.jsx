import { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../api';
import { signInWithPasskey } from '../passkey';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { setLoading(false); return; }
    api.auth.me()
      .then(setUser)
      // Only a rejected token logs you out — a network blip shouldn't.
      .catch(err => { if (err.status === 401 || err.status === 404) localStorage.removeItem('token'); })
      .finally(() => setLoading(false));
  }, []);

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

  async function register(username, password, display_name) {
    const { token, user } = await api.auth.register(username, password, display_name);
    localStorage.setItem('token', token);
    setUser(user);
    return user;
  }

  function logout() {
    localStorage.removeItem('token');
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, loginWithPasskey, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
