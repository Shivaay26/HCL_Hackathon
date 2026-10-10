const { getDb } = require('./db');
const { HttpError } = require('./http');

function listOrders(customerId) {
  const orders = getDb().prepare(
    'SELECT * FROM orders WHERE customer_id = ? ORDER BY order_date DESC'
  ).all(customerId);
  return orders.map((order) => summarize(order));
}

function getOrder(customerId, orderId) {
  const order = getDb().prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order) throw new HttpError(404, 'NOT_FOUND', 'Order was not found.');
  if (order.customer_id !== customerId) throw new HttpError(403, 'FORBIDDEN', 'That order belongs to another customer.');
  return {
    ...summarize(order),
    items: getDb().prepare(
      `SELECT oi.product_id, p.name AS product_name, oi.quantity, oi.unit_price
       FROM order_items oi JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id = ?`
    ).all(orderId).map((item) => ({
      productId: item.product_id,
      productName: item.product_name,
      quantity: item.quantity,
      unitPrice: item.unit_price,
      lineTotal: Number((item.quantity * item.unit_price).toFixed(2))
    })),
    shipmentEvents: getDb().prepare(
      `SELECT id, status, event_time, estimated_delivery, note
       FROM shipment_events WHERE order_id = ? ORDER BY event_time ASC`
    ).all(orderId).map((event) => ({
      id: event.id,
      status: event.status,
      timestamp: event.event_time,
      estimatedDelivery: event.estimated_delivery,
      note: event.note
    }))
  };
}

function summarize(order) {
  return {
    orderId: order.id,
    status: order.status,
    totalAmount: order.total_amount,
    orderDate: order.order_date
  };
}

module.exports = { listOrders, getOrder };
