const express = require('express');
const {
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
  removeCartItem
} = require('./catalog');
const { listOrders, getOrder } = require('./orders');
const { asyncHandler, optionalNumber, optionalString, requirePositiveInt, requireString } = require('./http');

const router = express.Router();

router.get('/categories', asyncHandler(async (req, res) => {
  res.json(listCategories());
}));

router.get('/products/compare', asyncHandler(async (req, res) => {
  const ids = String(req.query.ids || '').split(',').map((id) => id.trim()).filter(Boolean);
  res.json({ items: compareProducts(ids) });
}));

router.get('/products/:id', asyncHandler(async (req, res) => {
  res.json(getProduct(req.params.id));
}));

router.get('/products', asyncHandler(async (req, res) => {
  const page = req.query.page ? requirePositiveInt(req.query.page, 'Page', 1000) : 1;
  const size = req.query.size ? requirePositiveInt(req.query.size, 'Page size', 24) : 8;
  const sort = optionalString(req.query.sort, 20);
  const allowedSorts = new Set(['price_asc', 'price_desc', 'rating_asc', 'rating_desc']);
  if (sort && !allowedSorts.has(sort)) {
    const { HttpError } = require('./http');
    throw new HttpError(400, 'INVALID_REQUEST', 'Sort must be price or rating.');
  }
  res.json(searchProducts({
    search: optionalString(req.query.search, 80) || undefined,
    categoryId: optionalString(req.query.category, 40) || undefined,
    brand: optionalString(req.query.brand, 40) || undefined,
    minPrice: optionalNumber(req.query.minPrice, 'Minimum price'),
    maxPrice: optionalNumber(req.query.maxPrice, 'Maximum price'),
    sort,
    page,
    size
  }));
}));

router.get('/inventory/:productId', asyncHandler(async (req, res) => {
  res.json(getInventory(req.params.productId));
}));

router.get('/preferences', asyncHandler(async (req, res) => {
  res.json(getPreferences(req.customer.id));
}));

router.put('/preferences', asyncHandler(async (req, res) => {
  res.json(savePreferences(req.customer.id, req.body || {}));
}));

router.get('/wishlist', asyncHandler(async (req, res) => {
  res.json({ items: listWishlist(req.customer.id) });
}));

router.post('/wishlist', asyncHandler(async (req, res) => {
  const productId = requireString(req.body?.productId, 'Product', { max: 40 });
  res.json({ items: addWishlist(req.customer.id, productId) });
}));

router.delete('/wishlist/:productId', asyncHandler(async (req, res) => {
  res.json({ items: removeWishlist(req.customer.id, req.params.productId) });
}));

router.get('/cart', asyncHandler(async (req, res) => {
  res.json(mapCart(req.customer.id));
}));

router.post('/cart/items', asyncHandler(async (req, res) => {
  const productId = requireString(req.body?.productId, 'Product', { max: 40 });
  const quantity = requirePositiveInt(req.body?.quantity ?? 1, 'Quantity');
  res.json(addCartItem(req.customer.id, productId, quantity));
}));

router.put('/cart/items/:productId', asyncHandler(async (req, res) => {
  const quantity = requirePositiveInt(req.body?.quantity, 'Quantity');
  res.json(updateCartItem(req.customer.id, req.params.productId, quantity));
}));

router.delete('/cart/items/:productId', asyncHandler(async (req, res) => {
  res.json(removeCartItem(req.customer.id, req.params.productId));
}));

router.get('/orders', asyncHandler(async (req, res) => {
  res.json({ items: listOrders(req.customer.id) });
}));

router.get('/orders/:id', asyncHandler(async (req, res) => {
  res.json(getOrder(req.customer.id, req.params.id));
}));

module.exports = router;
