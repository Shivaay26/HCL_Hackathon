import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth, useCompare } from '../auth';

const links = [
  ['/', 'Shop'],
  ['/orders', 'Orders'],
  ['/assistant', 'Assistant'],
  ['/knowledge', 'Policies'],
  ['/audit', 'Audit']
];

export default function Layout() {
  const { customer, logout } = useAuth();
  const compare = useCompare();
  const navigate = useNavigate();
  const location = useLocation();
  const [cartCount, setCartCount] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    api.cart().then((data) => setCartCount(data.items.reduce((sum, item) => sum + item.quantity, 0))).catch(() => setCartCount(0));
  }, [location.pathname]);

  return (
    <div className="shell">
      <header className="topbar">
        <button className="menu" type="button" onClick={() => setOpen((value) => !value)} aria-label="Open menu">Menu</button>
        <Link to="/" className="brand">
          <span className="mark">S</span>
          <span>
            <strong>ShopSmart</strong>
            <small>AI marketplace</small>
          </span>
        </Link>
        <nav className={open ? 'nav open' : 'nav'} onClick={() => setOpen(false)}>
          {links.map(([to, label]) => (
            <NavLink key={to} to={to} end={to === '/'}>{label}</NavLink>
          ))}
        </nav>
        <div className="top-actions">
          <span className={`tier tier-${customer.membershipTier.toLowerCase()}`}>{customer.membershipTier}</span>
          <Link to="/preferences" className="text-link">{customer.name.split(' ')[0]}</Link>
          <Link to="/wishlist" className="text-link">Wishlist</Link>
          <Link to="/cart" className="cart-link">Cart {cartCount}</Link>
          <button type="button" className="ghost" onClick={() => { logout(); navigate('/login'); }}>Sign out</button>
        </div>
      </header>
      <main>
        <Outlet context={{ refreshCart: () => api.cart().then((data) => setCartCount(data.items.reduce((sum, item) => sum + item.quantity, 0))) }} />
      </main>
      {compare.ids.length > 0 && (
        <div className="compare-bar">
          <span>{compare.ids.length} selected for comparison</span>
          <div>
            <button type="button" className="ghost" onClick={compare.clear}>Clear</button>
            <Link to="/compare" className="button">Compare</Link>
          </div>
        </div>
      )}
    </div>
  );
}
