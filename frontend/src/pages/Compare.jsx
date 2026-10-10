import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, money } from '../api';
import { useCompare } from '../auth';

export default function Compare() {
  const compare = useCompare();
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (compare.ids.length < 2) {
      setItems([]);
      return;
    }
    api.compare(compare.ids).then((data) => setItems(data.items)).catch((err) => setError(err.message));
  }, [compare.ids]);

  if (compare.ids.length < 2) {
    return <div className="page"><h1>Compare</h1><p>Select 2 or 3 products from the shop.</p><Link to="/">Back to shop</Link></div>;
  }

  const specKeys = [...new Set(items.flatMap((item) => Object.keys(item.specifications)))];

  return (
    <div className="page">
      <h1>Compare</h1>
      {error && <p className="error">{error}</p>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Field</th>
              {items.map((item) => <th key={item.productId}>{item.productName}</th>)}
            </tr>
          </thead>
          <tbody>
            <tr><td>Id</td>{items.map((item) => <td key={item.productId}>{item.productId}</td>)}</tr>
            <tr><td>Brand</td>{items.map((item) => <td key={item.productId}>{item.brand}</td>)}</tr>
            <tr><td>Price</td>{items.map((item) => <td key={item.productId}>{money(item.price)}</td>)}</tr>
            <tr><td>Rating</td>{items.map((item) => <td key={item.productId}>{item.rating.toFixed(1)}</td>)}</tr>
            <tr><td>Availability</td>{items.map((item) => <td key={item.productId}>{item.availability}</td>)}</tr>
            {specKeys.map((key) => (
              <tr key={key}><td>{key}</td>{items.map((item) => <td key={item.productId}>{item.specifications[key] || '—'}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
