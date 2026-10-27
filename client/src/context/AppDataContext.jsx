import { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { api } from '../api';
import { useAuth } from './AuthContext';

const AppDataContext = createContext(null);

const COUNTRY_ISO2 = {
  AUS: 'AU', AUT: 'AT', AZE: 'AZ', BEL: 'BE', BRA: 'BR', BRN: 'BH', CAN: 'CA', CHN: 'CN',
  ESP: 'ES', GBR: 'GB', HUN: 'HU', ITA: 'IT', JPN: 'JP', KSA: 'SA', MEX: 'MX', MON: 'MC',
  NED: 'NL', POR: 'PT', QAT: 'QA', SGP: 'SG', UAE: 'AE', USA: 'US', FRA: 'FR', GER: 'DE',
  ARG: 'AR', RSA: 'ZA', TUR: 'TR', RUS: 'RU', VIE: 'VN', KOR: 'KR', IND: 'IN', MAS: 'MY',
};

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

  // Re-read the calendar after an admin changes race settings (e.g. the joker round).
  const reloadRaces = () => api.races.list().then(setRaces);

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

  // OpenF1 country codes are 3-letter (IOC-style); flag emoji need ISO 3166 alpha-2.
  function countryFlag(cc) {
    if (!cc) return '';
    const iso2 = cc.length === 2 ? cc.toUpperCase() : COUNTRY_ISO2[cc.toUpperCase()];
    if (!iso2) return '';
    return iso2.replace(/./g, c => String.fromCodePoint(127397 + c.charCodeAt()));
  }

  return (
    <AppDataContext.Provider value={{ races, reloadRaces, drivers, driversByStanding, loading, error, driverById, countryFlag }}>
      {children}
    </AppDataContext.Provider>
  );
}

export function useAppData() {
  return useContext(AppDataContext);
}
