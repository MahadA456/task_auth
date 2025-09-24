import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

function getToken() {
  try {
    return sessionStorage.getItem('token');
  } catch {
    return null;
  }
}

export const http = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'content-type': 'application/json' }
});

http.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.authorization = `Bearer ${token}`;
  return config;
});

http.interceptors.response.use(
  (res) => res,
  (error) => {
    const response = error?.response;
    const data = response?.data || { error: error.message || 'Request failed' };
    const status = response?.status || 0;
    return Promise.reject(Object.assign(new Error(data?.error || 'Request failed'), { status, data }));
  }
);

export const api = {
  signup: (payload) => http.post('/api/signup', payload).then((r) => r.data),
  login: (payload) => http.post('/api/login', payload).then((r) => r.data),
  getTasks: () => http.get('/api/tasks').then((r) => r.data),
  createTask: (payload) => http.post('/api/tasks', payload).then((r) => r.data),
  updateTask: (id, payload) => http.put(`/api/tasks/${id}`, payload).then((r) => r.data),
  deleteTask: (id) => http.delete(`/api/tasks/${id}`).then((r) => r.data),
  // Community
  getCommunityTasks: () => http.get('/api/tasks/community').then((r) => r.data),
  createCommunityTask: (payload) => http.post('/api/tasks/community', payload).then((r) => r.data),
  updateCommunityTask: (id, payload) => http.put(`/api/tasks/community/${id}`, payload).then((r) => r.data),
  deleteCommunityTask: (id) => http.delete(`/api/tasks/community/${id}`).then((r) => r.data),
  // Comments
  getComments: (taskId) => http.get(`/api/tasks/community/${taskId}/comments`).then((r) => r.data),
  addComment: (taskId, payload) => http.post(`/api/tasks/community/${taskId}/comments`, payload).then((r) => r.data),
  // Reactions
  addReaction: (taskId, emoji) => http.post(`/api/tasks/community/${taskId}/reactions`, { emoji }).then((r) => r.data),
  removeReaction: (taskId, emoji) => http.delete(`/api/tasks/community/${taskId}/reactions`, { data: { emoji } }).then((r) => r.data)
};


