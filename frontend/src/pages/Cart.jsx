import { useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { api, money } from '../api';

export default function Cart() {
  const { refreshCart } = useOutletContext();
  const [cart, setCart] = useState(null);
  const [error, setError] = useState('');

  function load() {
    api.cart().then(setCart).catch((err) => setError(err.message));
  }
  useEffect(load, []);

  async function change(productId, quantity) {
    try {
      const next = quantity < 1 ? await api.removeCart(productId) : await api.updateCart(productId, quantity);
      setCart(next);
      refreshCart();
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="page">
      <h1>Cart</h1>
      <p className="fine">Payment is out of scope. This cart only checks stock and totals.</p>
      {error && <p className="error">{error}</p>}
      {(cart?.items || []).length === 0 && <p>Your cart is empty. <Link to="/">Browse products</Link></p>}
      <ul className="line-list">
        {(cart?.items || []).map((item) => (
          <li key={item.productId}>
            <div>
              <Link to={`/product/${item.productId}`}><strong>{item.productName}</strong></Link>
              <p>{money(item.price)} · {item.availability.replaceAll('_', ' ')}</p>
            </div>
            <div className="qty">
              <button type="button" className="ghost" onClick={() => change(item.productId, item.quantity - 1)}>-</button>
              <span>{item.quantity}</span>
              <button type="button" className="ghost" onClick={() => change(item.productId, item.quantity + 1)}>+</button>
            </div>
            <strong>{money(item.lineTotal)}</strong>
          </li>
        ))}
      </ul>
      {cart && cart.items.length > 0 && <p className="total">Total {money(cart.total)}</p>}
    </div>
  );
}
