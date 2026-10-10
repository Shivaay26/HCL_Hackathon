import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth';
import Layout from './components/Layout';
import Login from './pages/Login';
import Shop from './pages/Shop';
import Product from './pages/Product';
import Compare from './pages/Compare';
import Wishlist from './pages/Wishlist';
import Cart from './pages/Cart';
import Orders from './pages/Orders';
import OrderDetail from './pages/OrderDetail';
import Assistant from './pages/Assistant';
import Knowledge from './pages/Knowledge';
import Preferences from './pages/Preferences';
import Audit from './pages/Audit';

function Guard({ children }) {
  const { customer, ready } = useAuth();
  const location = useLocation();
  if (!ready) return <div className="center-note">Loading ShopSmart…</div>;
  if (!customer) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Guard><Layout /></Guard>}>
        <Route index element={<Shop />} />
        <Route path="product/:id" element={<Product />} />
        <Route path="compare" element={<Compare />} />
        <Route path="wishlist" element={<Wishlist />} />
        <Route path="cart" element={<Cart />} />
        <Route path="orders" element={<Orders />} />
        <Route path="orders/:id" element={<OrderDetail />} />
        <Route path="assistant" element={<Assistant />} />
        <Route path="knowledge" element={<Knowledge />} />
        <Route path="preferences" element={<Preferences />} />
        <Route path="audit" element={<Audit />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
