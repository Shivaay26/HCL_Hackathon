import { Link } from 'react-router-dom';
import { money } from '../api';
import { useCompare } from '../auth';

export default function ProductCard({ product, wished, onWish, onCart }) {
  const compare = useCompare();
  const selected = compare.ids.includes(product.productId);
  return (
    <article className="product-card">
      <Link to={`/product/${product.productId}`} className="swatch" style={{ background: product.imageColor }}>
        <span>{product.brand}</span>
        <strong>{product.categoryName}</strong>
      </Link>
      <div className="product-body">
        <div className="product-meta">
          <span>{product.productId}</span>
          <span className={`stock ${product.availability.toLowerCase()}`}>{product.availability.replaceAll('_', ' ')}</span>
        </div>
        <h3><Link to={`/product/${product.productId}`}>{product.productName}</Link></h3>
        <p>{product.description}</p>
        <div className="price-row">
          <strong>{money(product.price)}</strong>
          <span>{product.rating.toFixed(1)} / 5</span>
        </div>
        <div className="card-actions">
          <button type="button" onClick={() => onCart(product)} disabled={product.availability === 'OUT_OF_STOCK'}>Add to cart</button>
          <button type="button" className="ghost" onClick={() => onWish(product)}>{wished ? 'Wishlisted' : 'Wishlist'}</button>
          <button type="button" className={selected ? 'ghost on' : 'ghost'} onClick={() => compare.toggle(product.productId)}>
            {selected ? 'Selected' : 'Compare'}
          </button>
        </div>
      </div>
    </article>
  );
}
