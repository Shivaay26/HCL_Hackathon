import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, setToken } from './api';

const AuthContext = createContext(null);
const CompareContext = createContext(null);

export function AuthProvider({ children }) {
  const [customer, setCustomer] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      setReady(true);
      return;
    }
    api.me()
      .then((data) => setCustomer(data.customer))
      .catch(() => setToken(null))
      .finally(() => setReady(true));
  }, []);

  const value = useMemo(() => ({
    customer,
    ready,
    async login(email, password) {
      const data = await api.login(email, password);
      setToken(data.token);
      setCustomer(data.customer);
    },
    logout() {
      setToken(null);
      setCustomer(null);
    }
  }), [customer, ready]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

export function CompareProvider({ children }) {
  const [ids, setIds] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('shopsmart-compare') || '[]');
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem('shopsmart-compare', JSON.stringify(ids));
  }, [ids]);

  const value = useMemo(() => ({
    ids,
    toggle(productId) {
      setIds((current) => {
        if (current.includes(productId)) return current.filter((id) => id !== productId);
        if (current.length >= 3) return current;
        return [...current, productId];
      });
    },
    clear() {
      setIds([]);
    }
  }), [ids]);

  return <CompareContext.Provider value={value}>{children}</CompareContext.Provider>;
}

export function useCompare() {
  return useContext(CompareContext);
}
