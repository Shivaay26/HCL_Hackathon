import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../api';
import ProductCard from '../components/ProductCard';

export default function Wishlist() {
  const { refreshCart } = useOutletContext();
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');

  function load() {
    api.wishlist().then((data) => setItems(data.items)).catch((err) => setError(err.message));
  }
  useEffect(load, []);

  return (
    <div className="page">
      <h1>Wishlist</h1>
      {error && <p className="error">{error}</p>}
      {items.length === 0 && <p>No saved products yet.</p>}
      <div className="grid">
        {items.map((product) => (
          <ProductCard
            key={product.productId}
            product={product}
            wished
            onWish={async () => { await api.removeWishlist(product.productId); load(); }}
            onCart={async (item) => {
              try {
                await api.addCart(item.productId, 1);
                refreshCart();
              } catch (err) {
                setError(err.message);
              }
            }}
          />
        ))}
      </div>
    </div>
  );
}
