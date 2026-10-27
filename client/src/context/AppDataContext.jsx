import { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { api } from '../api';
import { useAuth } from './AuthContext';

const AppDataContext = createContext(null);

export function AppDataProvider({ children }) {
  const { user } = useAuth();
  const [races, setRaces] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    Promise.all([api.races.list(), api.drivers.list()])
      .then(([r, d]) => { setRaces(r); setDrivers(d); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [user]);

  // Constructors' championship order, teammates side by side (higher-placed driver first).
  const driversByStanding = useMemo(() => {
    const rank = r => r ?? Infinity;
    return [...drivers].sort((a, b) =>
      rank(a.teamRank) - rank(b.teamRank) ||
      (a.team || '').localeCompare(b.team || '') ||
      rank(a.champRank) - rank(b.champRank) ||
      a.num - b.num
    );
  }, [drivers]);

  function driverById(id) {
    return drivers.find(d => d.id === id);
  }

  function countryFlag(cc) {
    if (!cc) return '';
    return cc.toUpperCase().replace(/./g, c => String.fromCodePoint(127397 + c.charCodeAt()));
  }

  return (
    <AppDataContext.Provider value={{ races, drivers, driversByStanding, loading, error, driverById, countryFlag }}>
      {children}
    </AppDataContext.Provider>
  );
}

export function useAppData() {
  return useContext(AppDataContext);
}
