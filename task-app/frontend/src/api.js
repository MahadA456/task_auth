const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

function getToken() {
  try {
    return sessionStorage.getItem('token');
  } catch {
    return null;
  }
}

async function request(path, { method = 'GET', body, headers = {} } = {}) {
  const token = getToken();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('application/json') ? await res.json() : await res.text();
  if (!res.ok) {
    const err = typeof data === 'string' ? { error: data } : data;
    throw Object.assign(new Error(err?.error || 'Request failed'), { status: res.status, data: err });
  }
  return data;
}

export const api = {
  signup: (payload) => request('/api/signup', { method: 'POST', body: payload }),
  login: (payload) => request('/api/login', { method: 'POST', body: payload }),
  getTasks: () => request('/api/tasks'),
  createTask: (payload) => request('/api/tasks', { method: 'POST', body: payload }),
  updateTask: (id, payload) => request(`/api/tasks/${id}`, { method: 'PUT', body: payload }),
  deleteTask: (id) => request(`/api/tasks/${id}`, { method: 'DELETE' })
};


