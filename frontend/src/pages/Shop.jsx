import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../api';
import ProductCard from '../components/ProductCard';

function flatten(nodes, depth = 0, acc = []) {
  for (const node of nodes) {
    acc.push({ id: node.id, name: node.name, depth });
    flatten(node.children || [], depth + 1, acc);
  }
  return acc;
}

export default function Shop() {
  const { refreshCart } = useOutletContext();
  const [categories, setCategories] = useState([]);
  const [data, setData] = useState(null);
  const [wishlist, setWishlist] = useState([]);
  const [error, setError] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [query, setQuery] = useState({ search: '', category: '', brand: '', minPrice: '', maxPrice: '', sort: 'rating_desc', page: 1 });

  useEffect(() => {
    api.categories().then(setCategories).catch((err) => setError(err.message));
    api.wishlist().then((result) => setWishlist(result.items.map((item) => item.productId))).catch(() => {});
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value !== '' && value != null) params.set(key, value);
    });
    api.products(params).then(setData).catch((err) => setError(err.message));
  }, [query]);

  async function onWish(product) {
    const next = wishlist.includes(product.productId)
      ? await api.removeWishlist(product.productId)
      : await api.addWishlist(product.productId);
    setWishlist(next.items.map((item) => item.productId));
  }

  async function onCart(product) {
    try {
      await api.addCart(product.productId, 1);
      refreshCart();
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }

  const flat = flatten(categories);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">Catalog</p>
          <h1>Shop the floor</h1>
        </div>
        <label className="search">
          Search
          <input value={query.search} placeholder="Laptop, coffee, Java…" onChange={(event) => setQuery({ ...query, search: event.target.value, page: 1 })} />
        </label>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="shop-layout">
        <button type="button" className="ghost filters-toggle" onClick={() => setFiltersOpen((value) => !value)}>Filters</button>
        <aside className={filtersOpen ? 'filters open' : 'filters'}>
          <label>Category
            <select value={query.category} onChange={(event) => setQuery({ ...query, category: event.target.value, brand: '', page: 1 })}>
              <option value="">All categories</option>
              {flat.map((category) => (
                <option key={category.id} value={category.id}>{`${'· '.repeat(category.depth)}${category.name}`}</option>
              ))}
            </select>
          </label>
          <label>Brand
            <select value={query.brand} onChange={(event) => setQuery({ ...query, brand: event.target.value, page: 1 })}>
              <option value="">All brands</option>
              {(data?.facets.brands || []).map((brand) => (
                <option key={brand.name} value={brand.name}>{brand.name} ({brand.count})</option>
              ))}
            </select>
          </label>
          <label>Min price<input type="number" min="0" value={query.minPrice} onChange={(event) => setQuery({ ...query, minPrice: event.target.value, page: 1 })} /></label>
          <label>Max price<input type="number" min="0" value={query.maxPrice} onChange={(event) => setQuery({ ...query, maxPrice: event.target.value, page: 1 })} /></label>
          <label>Sort
            <select value={query.sort} onChange={(event) => setQuery({ ...query, sort: event.target.value, page: 1 })}>
              <option value="rating_desc">Rating, high to low</option>
              <option value="rating_asc">Rating, low to high</option>
              <option value="price_asc">Price, low to high</option>
              <option value="price_desc">Price, high to low</option>
            </select>
          </label>
        </aside>
        <section>
          <div className="grid">
            {(data?.items || []).map((product) => (
              <ProductCard key={product.productId} product={product} wished={wishlist.includes(product.productId)} onWish={onWish} onCart={onCart} />
            ))}
          </div>
          {data && data.items.length === 0 && <p className="center-note">No products match those filters.</p>}
          {data && (
            <div className="pager">
              <button type="button" className="ghost" disabled={query.page <= 1} onClick={() => setQuery({ ...query, page: query.page - 1 })}>Previous</button>
              <span>Page {data.page} of {data.totalPages}</span>
              <button type="button" className="ghost" disabled={query.page >= data.totalPages} onClick={() => setQuery({ ...query, page: query.page + 1 })}>Next</button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
