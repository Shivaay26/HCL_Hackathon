const { getDb, availabilityFor } = require('./db');
const { HttpError } = require('./http');

function categoryIdsIncludingChildren(categoryId) {
  if (!categoryId) return [];
  const rows = getDb().prepare('SELECT id, parent_id FROM categories').all();
  const children = new Map();
  for (const row of rows) {
    if (!children.has(row.parent_id)) children.set(row.parent_id, []);
    children.get(row.parent_id).push(row.id);
  }
  const ids = [];
  const walk = (id) => {
    ids.push(id);
    for (const child of children.get(id) || []) walk(child);
  };
  if (!rows.some((row) => row.id === categoryId)) {
    throw new HttpError(400, 'INVALID_REQUEST', 'Unknown category.');
  }
  walk(categoryId);
  return ids;
}

function stockByProduct(productIds) {
  if (!productIds.length) return new Map();
  const placeholders = productIds.map(() => '?').join(',');
  const rows = getDb().prepare(
    `SELECT product_id, SUM(quantity) AS quantity
     FROM inventory WHERE product_id IN (${placeholders}) GROUP BY product_id`
  ).all(...productIds);
  return new Map(rows.map((row) => [row.product_id, row.quantity]));
}

function mapProduct(row, quantity) {
  const specs = JSON.parse(row.specifications);
  return {
    productId: row.id,
    productName: row.name,
    categoryId: row.category_id,
    categoryName: row.category_name,
    brand: row.brand,
    description: row.description,
    price: row.price,
    rating: row.rating,
    imageColor: row.image_color,
    specifications: specs,
    stockQuantity: quantity,
    availability: availabilityFor(quantity)
  };
}

const PRODUCT_SELECT = `
  SELECT p.*, c.name AS category_name
  FROM products p
  JOIN categories c ON c.id = p.category_id
`;

function listCategories() {
  const rows = getDb().prepare('SELECT id, name, parent_id FROM categories ORDER BY name').all();
  const nodes = rows.map((row) => ({ id: row.id, name: row.name, parentId: row.parent_id, children: [] }));
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const roots = [];
  for (const node of nodes) {
    if (node.parentId && byId.has(node.parentId)) byId.get(node.parentId).children.push(node);
    else roots.push(node);
  }
  return roots;
}

function searchProducts(query) {
  const page = query.page || 1;
  const size = query.size || 8;
  const where = [];
  const params = [];
  if (query.search) {
    where.push('(p.name LIKE ? OR p.brand LIKE ? OR p.description LIKE ? OR p.specifications LIKE ?)');
    const like = `%${query.search}%`;
    params.push(like, like, like, like);
  }
  if (query.categoryId) {
    const ids = categoryIdsIncludingChildren(query.categoryId);
    where.push(`p.category_id IN (${ids.map(() => '?').join(',')})`);
    params.push(...ids);
  }
  if (query.brand) {
    where.push('p.brand = ?');
    params.push(query.brand);
  }
  if (query.minPrice != null) {
    where.push('p.price >= ?');
    params.push(query.minPrice);
  }
  if (query.maxPrice != null) {
    where.push('p.price <= ?');
    params.push(query.maxPrice);
  }
  const sorts = {
    price_asc: 'p.price ASC',
    price_desc: 'p.price DESC',
    rating_asc: 'p.rating ASC',
    rating_desc: 'p.rating DESC'
  };
  const orderBy = sorts[query.sort] || sorts.rating_desc;
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = getDb().prepare(`SELECT COUNT(*) AS n FROM products p ${clause}`).get(...params).n;
  const rows = getDb().prepare(
    `${PRODUCT_SELECT} ${clause} ORDER BY ${orderBy}, p.name ASC LIMIT ? OFFSET ?`
  ).all(...params, size, (page - 1) * size);
  const stock = stockByProduct(rows.map((row) => row.id));
  const brandRows = getDb().prepare(
    `SELECT brand, COUNT(*) AS count FROM products p ${clause} GROUP BY brand ORDER BY brand`
  ).all(...params);
  return {
    items: rows.map((row) => mapProduct(row, stock.get(row.id) || 0)),
    page,
    size,
    total,
    totalPages: Math.max(1, Math.ceil(total / size)),
    facets: { brands: brandRows.map((row) => ({ name: row.brand, count: row.count })) }
  };
}

function getProduct(productId) {
  const row = getDb().prepare(`${PRODUCT_SELECT} WHERE p.id = ?`).get(productId);
  if (!row) throw new HttpError(404, 'NOT_FOUND', 'Product was not found.');
  const stock = stockByProduct([row.id]);
  return mapProduct(row, stock.get(row.id) || 0);
}

function compareProducts(ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length < 2 || unique.length > 3) {
    throw new HttpError(400, 'INVALID_REQUEST', 'Choose 2 or 3 products to compare.');
  }
  return unique.map((id) => getProduct(id));
}

function getInventory(productId) {
  const product = getProduct(productId);
  const rows = getDb().prepare(
    `SELECT w.id, w.name, w.location, i.quantity
     FROM inventory i JOIN warehouses w ON w.id = i.warehouse_id
     WHERE i.product_id = ? ORDER BY w.name`
  ).all(productId);
  return {
    productId,
    availability: product.availability,
    totalQuantity: product.stockQuantity,
    warehouses: rows.map((row) => ({
      warehouseId: row.id,
      name: row.name,
      location: row.location,
      quantity: row.quantity
    }))
  };
}

function getPreferences(customerId) {
  const row = getDb().prepare('SELECT * FROM customer_preferences WHERE customer_id = ?').get(customerId);
  if (!row) return { categories: [], brands: [], budget: null };
  return {
    categories: JSON.parse(row.categories),
    brands: JSON.parse(row.brands),
    budget: row.budget
  };
}

function savePreferences(customerId, input) {
  const categories = Array.isArray(input.categories) ? input.categories : [];
  const brands = Array.isArray(input.brands) ? input.brands : [];
  if (categories.length > 12 || brands.length > 12) {
    throw new HttpError(400, 'INVALID_REQUEST', 'Choose up to 12 categories and 12 brands.');
  }
  if (!categories.every((id) => typeof id === 'string')) {
    throw new HttpError(400, 'INVALID_REQUEST', 'Categories must be a list of ids.');
  }
  const known = new Set(getDb().prepare('SELECT id FROM categories').all().map((row) => row.id));
  if (categories.some((id) => !known.has(id))) {
    throw new HttpError(400, 'INVALID_REQUEST', 'Unknown category.');
  }
  const cleanBrands = brands.map((brand) => {
    if (typeof brand !== 'string' || !brand.trim() || brand.length > 40) {
      throw new HttpError(400, 'INVALID_REQUEST', 'Brand names must be short text.');
    }
    return brand.trim();
  });
  let budget = null;
  if (input.budget != null && input.budget !== '') {
    budget = Number(input.budget);
    if (!Number.isFinite(budget) || budget < 0 || budget > 100000) {
      throw new HttpError(400, 'INVALID_REQUEST', 'Budget must be a number from 0 to 100000.');
    }
  }
  getDb().prepare(
    `INSERT INTO customer_preferences (customer_id, categories, brands, budget)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(customer_id) DO UPDATE SET categories = excluded.categories, brands = excluded.brands, budget = excluded.budget`
  ).run(customerId, JSON.stringify(categories), JSON.stringify(cleanBrands), budget);
  return getPreferences(customerId);
}

function listWishlist(customerId) {
  const rows = getDb().prepare(
    `${PRODUCT_SELECT}
     JOIN wishlist_items w ON w.product_id = p.id
     WHERE w.customer_id = ?
     ORDER BY p.name`
  ).all(customerId);
  const stock = stockByProduct(rows.map((row) => row.id));
  return rows.map((row) => mapProduct(row, stock.get(row.id) || 0));
}

function addWishlist(customerId, productId) {
  getProduct(productId);
  getDb().prepare('INSERT OR IGNORE INTO wishlist_items (customer_id, product_id) VALUES (?, ?)').run(customerId, productId);
  return listWishlist(customerId);
}

function removeWishlist(customerId, productId) {
  getDb().prepare('DELETE FROM wishlist_items WHERE customer_id = ? AND product_id = ?').run(customerId, productId);
  return listWishlist(customerId);
}

function mapCart(customerId) {
  const rows = getDb().prepare(
    `${PRODUCT_SELECT}
     JOIN cart_items ci ON ci.product_id = p.id
     WHERE ci.customer_id = ?
     ORDER BY p.name`
  ).all(customerId);
  const stock = stockByProduct(rows.map((row) => row.id));
  const quantityRows = getDb().prepare('SELECT product_id, quantity FROM cart_items WHERE customer_id = ?').all(customerId);
  const quantities = new Map(quantityRows.map((row) => [row.product_id, row.quantity]));
  const items = rows.map((row) => {
    const product = mapProduct(row, stock.get(row.id) || 0);
    const quantity = quantities.get(row.id);
    return {
      ...product,
      quantity,
      lineTotal: Number((product.price * quantity).toFixed(2))
    };
  });
  const total = Number(items.reduce((sum, item) => sum + item.lineTotal, 0).toFixed(2));
  return { items, total };
}

function addCartItem(customerId, productId, quantity) {
  const product = getProduct(productId);
  if (product.availability === 'OUT_OF_STOCK') {
    throw new HttpError(409, 'OUT_OF_STOCK', 'This product is out of stock.');
  }
  const existing = getDb().prepare('SELECT quantity FROM cart_items WHERE customer_id = ? AND product_id = ?').get(customerId, productId);
  const next = (existing?.quantity || 0) + quantity;
  if (next > product.stockQuantity) {
    throw new HttpError(409, 'OUT_OF_STOCK', 'Not enough stock for that quantity.');
  }
  getDb().prepare(
    `INSERT INTO cart_items (customer_id, product_id, quantity) VALUES (?, ?, ?)
     ON CONFLICT(customer_id, product_id) DO UPDATE SET quantity = excluded.quantity`
  ).run(customerId, productId, next);
  return mapCart(customerId);
}

function updateCartItem(customerId, productId, quantity) {
  const product = getProduct(productId);
  const existing = getDb().prepare('SELECT quantity FROM cart_items WHERE customer_id = ? AND product_id = ?').get(customerId, productId);
  if (!existing) throw new HttpError(404, 'NOT_FOUND', 'That item is not in the cart.');
  if (quantity > product.stockQuantity) {
    throw new HttpError(409, 'OUT_OF_STOCK', 'Not enough stock for that quantity.');
  }
  getDb().prepare('UPDATE cart_items SET quantity = ? WHERE customer_id = ? AND product_id = ?').run(quantity, customerId, productId);
  return mapCart(customerId);
}

function removeCartItem(customerId, productId) {
  getDb().prepare('DELETE FROM cart_items WHERE customer_id = ? AND product_id = ?').run(customerId, productId);
  return mapCart(customerId);
}

module.exports = {
  listCategories,
  searchProducts,
  getProduct,
  compareProducts,
  getInventory,
  getPreferences,
  savePreferences,
  listWishlist,
  addWishlist,
  removeWishlist,
  mapCart,
  addCartItem,
  updateCartItem,
  removeCartItem,
  categoryIdsIncludingChildren
};
