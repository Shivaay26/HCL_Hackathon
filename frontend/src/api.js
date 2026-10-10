const TOKEN_KEY = 'shopsmart-token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  const response = await fetch(path, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || 'Request failed.');
    error.code = data.code;
    error.status = response.status;
    throw error;
  }
  return data;
}

export const api = {
  login: (email, password) => request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  me: () => request('/api/auth/me'),
  categories: () => request('/api/categories'),
  products: (params) => request(`/api/products?${params}`),
  product: (id) => request(`/api/products/${id}`),
  compare: (ids) => request(`/api/products/compare?ids=${ids.map(encodeURIComponent).join(',')}`),
  inventory: (id) => request(`/api/inventory/${id}`),
  preferences: () => request('/api/preferences'),
  savePreferences: (body) => request('/api/preferences', { method: 'PUT', body: JSON.stringify(body) }),
  wishlist: () => request('/api/wishlist'),
  addWishlist: (productId) => request('/api/wishlist', { method: 'POST', body: JSON.stringify({ productId }) }),
  removeWishlist: (productId) => request(`/api/wishlist/${productId}`, { method: 'DELETE' }),
  cart: () => request('/api/cart'),
  addCart: (productId, quantity = 1) => request('/api/cart/items', { method: 'POST', body: JSON.stringify({ productId, quantity }) }),
  updateCart: (productId, quantity) => request(`/api/cart/items/${productId}`, { method: 'PUT', body: JSON.stringify({ quantity }) }),
  removeCart: (productId) => request(`/api/cart/items/${productId}`, { method: 'DELETE' }),
  orders: () => request('/api/orders'),
  order: (id) => request(`/api/orders/${id}`),
  documents: () => request('/api/documents'),
  uploadDocument: (form) => request('/api/documents', { method: 'POST', body: form }),
  recommend: (message) => request('/api/ai/recommendations', { method: 'POST', body: JSON.stringify({ message }) }),
  knowledge: (question, extra = {}) => request('/api/ai/knowledge', { method: 'POST', body: JSON.stringify({ question, ...extra }) }),
  chat: (message) => request('/api/ai/chat', { method: 'POST', body: JSON.stringify({ message }) }),
  audit: () => request('/api/audit')
};

export function money(value) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value || 0);
}

export function when(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
