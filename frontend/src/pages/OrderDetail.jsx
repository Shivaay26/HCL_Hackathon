import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, money, when } from '../api';

export default function OrderDetail() {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api.order(id).then(setOrder).catch((err) => setError(err.message)); }, [id]);
  if (error) return <p className="error page">{error}</p>;
  if (!order) return <p className="center-note">Loading order…</p>;
  return (
    <div className="page">
      <Link to="/orders" className="text-link">All orders</Link>
      <h1>{order.orderId}</h1>
      <p>{order.status} · {money(order.totalAmount)} · placed {when(order.orderDate)}</p>
      <h2>Items</h2>
      <ul className="plain-list">
        {order.items.map((item) => (
          <li key={item.productId}>{item.productName} × {item.quantity} · {money(item.lineTotal)}</li>
        ))}
      </ul>
      <h2>Shipment</h2>
      <ol className="timeline">
        {order.shipmentEvents.map((event) => (
          <li key={event.id}>
            <strong>{event.status.replaceAll('_', ' ')}</strong>
            <span>{when(event.timestamp)}</span>
            <p>{event.note}</p>
            <p className="fine">Estimated delivery {event.estimatedDelivery}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
