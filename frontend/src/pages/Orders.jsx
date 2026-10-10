import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, money, when } from '../api';

export default function Orders() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => { api.orders().then((data) => setItems(data.items)).catch((err) => setError(err.message)); }, []);
  return (
    <div className="page">
      <h1>Orders</h1>
      <p className="fine">These orders and delivery events are simulated.</p>
      {error && <p className="error">{error}</p>}
      {items.length === 0 && <p>No orders on this account.</p>}
      <div className="stack">
        {items.map((order) => (
          <Link key={order.orderId} to={`/orders/${order.orderId}`} className="order-card">
            <div>
              <strong>{order.orderId}</strong>
              <p>{when(order.orderDate)}</p>
            </div>
            <span className="stock">{order.status}</span>
            <strong>{money(order.totalAmount)}</strong>
          </Link>
        ))}
      </div>
    </div>
  );
}
