import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { AuthContext } from './AuthContextContext';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const saved = sessionStorage.getItem('token');
    if (saved) {
      setToken(saved);
      // Optionally decode token to get user; for now store minimal user in localStorage
      const savedUser = sessionStorage.getItem('user');
      if (savedUser) setUser(JSON.parse(savedUser));
    }
    setLoading(false);
  }, []);

  const login = useCallback(async (email, password) => {
    const { token: t, user: u } = await api.login({ email, password });
    sessionStorage.setItem('token', t);
    sessionStorage.setItem('user', JSON.stringify(u));
    setToken(t);
    setUser(u);
  }, []);

  const signup = useCallback(async (fullName, email, password) => {
    await api.signup({ fullName, email, password });
    await login(email, password);
  }, [login]);

  const logout = useCallback(() => {
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('user');
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, token, loading, login, signup, logout, setUser }), [user, token, loading, login, signup, logout, setUser]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// no non-component exports beyond context


