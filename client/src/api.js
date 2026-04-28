const BASE = '/api';

function getToken() {
  return localStorage.getItem('token');
}

async function request(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  return res.json();
}

export const api = {
  get:    (path)        => request('GET',    path),
  post:   (path, body)  => request('POST',   path, body),
  put:    (path, body)  => request('PUT',    path, body),
  delete: (path)        => request('DELETE', path),

  auth: {
    login:    (username, password)                => request('POST', '/auth/login',    { username, password }),
    register: (username, password, display_name)  => request('POST', '/auth/register', { username, password, display_name }),
    me:       ()                                  => request('GET',  '/auth/me'),
  },

  races:   { list: () => request('GET', '/races') },
  drivers: { list: () => request('GET', '/drivers') },

  predictions: {
    list:    (round)        => request('GET',  `/predictions/${round}`),
    mine:    (round)        => request('GET',  `/predictions/${round}/mine`),
    myAll:   ()             => request('GET',  '/predictions'),
    save:    (round, data)  => request('POST', `/predictions/${round}`, data),
  },

  results: {
    get: (round) => request('GET', `/results/${round}`),
  },

  scores: {
    leaderboard: () => request('GET', '/scores'),
  },

  admin: {
    overview:    ()               => request('GET',  '/admin/overview'),
    users:       ()               => request('GET',  '/admin/users'),
    updateUser:  (id, data)       => request('PUT',  `/admin/users/${id}`, data),
    deletePred:  (uid, round)     => request('DELETE', `/admin/users/${uid}/predictions/${round}`),
    scoring:     ()               => request('GET',  '/admin/scoring'),
    saveScoring: (rules)          => request('PUT',  '/admin/scoring', rules),
    races:       ()               => request('GET',  '/admin/races'),
    saveRace:    (round, data)    => request('PUT',  `/admin/races/${round}`, data),
    results:     ()               => request('GET',  '/admin/results'),
    saveResult:  (round, data)    => request('PUT',  `/admin/results/${round}`, data),
    rescore:     (round)          => request('POST', `/admin/results/${round}/rescore`),
    import:      (data)           => request('POST', '/admin/import', data),
  },
};
