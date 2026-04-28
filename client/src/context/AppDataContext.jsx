import { createContext, useContext, useState, useEffect } from 'react';
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

  function driverById(id) {
    return drivers.find(d => d.id === id);
  }

  function countryFlag(cc) {
    if (!cc) return '';
    return cc.toUpperCase().replace(/./g, c => String.fromCodePoint(127397 + c.charCodeAt()));
  }

  return (
    <AppDataContext.Provider value={{ races, drivers, loading, error, driverById, countryFlag }}>
      {children}
    </AppDataContext.Provider>
  );
}

export function useAppData() {
  return useContext(AppDataContext);
}
