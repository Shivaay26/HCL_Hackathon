import { useEffect, useState } from 'react';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import { api, money } from '../api';
import { useCompare } from '../auth';

export default function Product() {
  const { id } = useParams();
  const { refreshCart } = useOutletContext();
  const compare = useCompare();
  const [product, setProduct] = useState(null);
  const [inventory, setInventory] = useState(null);
  const [wished, setWished] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    setError('');
    api.product(id).then(setProduct).catch((err) => setError(err.message));
    api.inventory(id).then(setInventory).catch(() => {});
    api.wishlist().then((data) => setWished(data.items.some((item) => item.productId === id))).catch(() => {});
  }, [id]);

  if (error) return <p className="error page">{error}</p>;
  if (!product) return <p className="center-note">Loading product…</p>;

  return (
    <div className="page product-page">
      <Link to="/" className="text-link">Back to shop</Link>
      <div className="detail">
        <div className="swatch large" style={{ background: product.imageColor }}>
          <span>{product.brand}</span>
          <strong>{product.categoryName}</strong>
        </div>
        <div>
          <p className="eyebrow">{product.productId}</p>
          <h1>{product.productName}</h1>
          <p>{product.description}</p>
          <p className="price-row"><strong>{money(product.price)}</strong><span>{product.rating.toFixed(1)} / 5</span></p>
          <p className={`stock ${product.availability.toLowerCase()}`}>{product.availability.replaceAll('_', ' ')}</p>
          <div className="card-actions">
            <button type="button" disabled={product.availability === 'OUT_OF_STOCK'} onClick={async () => {
              try {
                await api.addCart(product.productId, 1);
                refreshCart();
                setNote('Added to cart.');
              } catch (err) {
                setError(err.message);
              }
            }}>Add to cart</button>
            <button type="button" className="ghost" onClick={async () => {
              const data = wished ? await api.removeWishlist(product.productId) : await api.addWishlist(product.productId);
              setWished(data.items.some((item) => item.productId === product.productId));
            }}>{wished ? 'Remove wishlist' : 'Add wishlist'}</button>
            <button type="button" className="ghost" onClick={() => compare.toggle(product.productId)}>
              {compare.ids.includes(product.productId) ? 'Selected' : 'Compare'}
            </button>
          </div>
          {note && <p className="fine">{note}</p>}
          <h2>Specifications</h2>
          <dl className="specs">
            {Object.entries(product.specifications).map(([key, value]) => (
              <div key={key}><dt>{key}</dt><dd>{value}</dd></div>
            ))}
          </dl>
          <h2>Warehouses</h2>
          <ul className="plain-list">
            {(inventory?.warehouses || []).map((warehouse) => (
              <li key={warehouse.warehouseId}>{warehouse.name}, {warehouse.location}: {warehouse.quantity}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
