const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');
const { chunkPlainText, embed } = require('./text');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'shopsmart.sqlite');

let db;

async function initDb() {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const { openDatabase } = require('./sqlite');
  db = await openDatabase(DB_PATH);
  db.pragma('foreign_keys = ON');
  migrate(db);
  seed(db);
  seedKnowledge(db);
  return db;
}

function getDb() {
  if (!db) throw new Error('Database is not ready.');
  return db;
}

function migrate(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      membership_tier TEXT NOT NULL CHECK (membership_tier IN ('Basic', 'Prime', 'Premium'))
    );

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      parent_id TEXT REFERENCES categories(id)
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category_id TEXT NOT NULL REFERENCES categories(id),
      brand TEXT NOT NULL,
      description TEXT NOT NULL,
      price REAL NOT NULL CHECK (price >= 0),
      rating REAL NOT NULL CHECK (rating >= 0 AND rating <= 5),
      image_color TEXT NOT NULL,
      specifications TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS warehouses (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      location TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS inventory (
      product_id TEXT NOT NULL REFERENCES products(id),
      warehouse_id TEXT NOT NULL REFERENCES warehouses(id),
      quantity INTEGER NOT NULL CHECK (quantity >= 0),
      PRIMARY KEY (product_id, warehouse_id)
    );

    CREATE TABLE IF NOT EXISTS customer_preferences (
      customer_id TEXT PRIMARY KEY REFERENCES customers(id),
      categories TEXT NOT NULL,
      brands TEXT NOT NULL,
      budget REAL
    );

    CREATE TABLE IF NOT EXISTS wishlist_items (
      customer_id TEXT NOT NULL REFERENCES customers(id),
      product_id TEXT NOT NULL REFERENCES products(id),
      PRIMARY KEY (customer_id, product_id)
    );

    CREATE TABLE IF NOT EXISTS cart_items (
      customer_id TEXT NOT NULL REFERENCES customers(id),
      product_id TEXT NOT NULL REFERENCES products(id),
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      PRIMARY KEY (customer_id, product_id)
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL REFERENCES customers(id),
      status TEXT NOT NULL,
      total_amount REAL NOT NULL,
      order_date TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT NOT NULL REFERENCES orders(id),
      product_id TEXT NOT NULL REFERENCES products(id),
      quantity INTEGER NOT NULL,
      unit_price REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS shipment_events (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES orders(id),
      status TEXT NOT NULL,
      event_time TEXT NOT NULL,
      estimated_delivery TEXT,
      note TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS knowledge_documents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      format TEXT NOT NULL,
      version TEXT NOT NULL,
      effective_date TEXT NOT NULL,
      category TEXT NOT NULL,
      region TEXT NOT NULL,
      approval_status TEXT NOT NULL,
      uploaded_by TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS document_chunks (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
      chunk_index INTEGER NOT NULL,
      section TEXT NOT NULL,
      text TEXT NOT NULL,
      embedding TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_records (
      id TEXT PRIMARY KEY,
      customer_id TEXT REFERENCES customers(id),
      endpoint TEXT NOT NULL,
      request TEXT NOT NULL,
      ai_response TEXT NOT NULL,
      model_name TEXT NOT NULL,
      tool_activity TEXT NOT NULL,
      source_references TEXT NOT NULL,
      outcome TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
}

function seed(database) {
  const existing = database.prepare('SELECT COUNT(*) AS n FROM customers').get().n;
  if (existing > 0) return;

  const passwordHash = bcrypt.hashSync('ShopSmart123', 10);
  const insertCustomer = database.prepare(
    'INSERT INTO customers (id, name, email, password_hash, membership_tier) VALUES (?, ?, ?, ?, ?)'
  );
  const customers = [
    ['CUS-BASIC', 'Asha Menon', 'basic@shopsmart.ai', 'Basic'],
    ['CUS-PRIME', 'Rohan Iyer', 'prime@shopsmart.ai', 'Prime'],
    ['CUS-PREMIUM', 'Meera Shah', 'premium@shopsmart.ai', 'Premium']
  ];
  const insertCategory = database.prepare('INSERT INTO categories (id, name, parent_id) VALUES (?, ?, ?)');
  const categories = [
    ['CAT-ELECTRONICS', 'Electronics', null],
    ['CAT-LAPTOPS', 'Laptops', 'CAT-ELECTRONICS'],
    ['CAT-PHONES', 'Smartphones', 'CAT-ELECTRONICS'],
    ['CAT-AUDIO', 'Audio', 'CAT-ELECTRONICS'],
    ['CAT-FASHION', 'Fashion', null],
    ['CAT-MEN', 'Men', 'CAT-FASHION'],
    ['CAT-WOMEN', 'Women', 'CAT-FASHION'],
    ['CAT-HOME', 'Home Appliances', null],
    ['CAT-KITCHEN', 'Kitchen', 'CAT-HOME'],
    ['CAT-CLEANING', 'Cleaning', 'CAT-HOME'],
    ['CAT-BOOKS', 'Books', null],
    ['CAT-HEALTH', 'Healthcare', null],
    ['CAT-GROCERIES', 'Groceries', null]
  ];
  const insertProduct = database.prepare(
    `INSERT INTO products
      (id, name, category_id, brand, description, price, rating, image_color, specifications)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const products = [
    ['LAP101', 'Dell Inspiron 15', 'CAT-LAPTOPS', 'Dell', '15-inch laptop for Java development, coursework, and local AI projects.', 899, 4.4, '#1f6f5b', { ram: '16GB RAM', processor: 'Intel i7 processor', storage: '512GB SSD storage', display: '15.6-inch FHD' }],
    ['LAP102', 'Lenovo ThinkPad E14', 'CAT-LAPTOPS', 'Lenovo', 'Business laptop with a comfortable keyboard for long Java and writing sessions.', 949, 4.6, '#245b78', { ram: '16GB RAM', processor: 'AMD Ryzen 7 processor', storage: '512GB SSD storage', display: '14-inch FHD' }],
    ['LAP103', 'Apple MacBook Air 13', 'CAT-LAPTOPS', 'Apple', 'Light laptop with strong battery life for general development.', 1099, 4.8, '#8a8f98', { ram: '8GB RAM', processor: 'Apple M2 processor', storage: '256GB SSD storage', display: '13.6-inch Liquid Retina' }],
    ['LAP104', 'HP Pavilion 14', 'CAT-LAPTOPS', 'HP', 'Compact laptop for coursework and office work.', 749, 4.2, '#3d6b4f', { ram: '16GB RAM', processor: 'Intel i5 processor', storage: '512GB SSD storage', display: '14-inch FHD' }],
    ['LAP105', 'ASUS Vivobook 16', 'CAT-LAPTOPS', 'ASUS', 'Larger memory configuration for local AI experiments and multitasking.', 980, 4.5, '#0e4d6c', { ram: '32GB RAM', processor: 'AMD Ryzen 7 processor', storage: '1TB SSD storage', display: '16-inch FHD' }],
    ['PHN201', 'Samsung Galaxy A55', 'CAT-PHONES', 'Samsung', 'Midrange smartphone with a bright display and long software support.', 449, 4.4, '#1d4e89', { display: '6.6-inch AMOLED', storage: '128GB storage', camera: '50MP camera', battery: '5000mAh' }],
    ['PHN202', 'Google Pixel 8a', 'CAT-PHONES', 'Google', 'Compact phone with strong camera processing.', 499, 4.5, '#3c6e71', { display: '6.1-inch OLED', storage: '128GB storage', camera: '64MP camera', battery: '4490mAh' }],
    ['PHN203', 'Apple iPhone 15', 'CAT-PHONES', 'Apple', 'Mainstream smartphone with a capable camera and five years of updates.', 799, 4.7, '#5c6670', { display: '6.1-inch OLED', storage: '128GB storage', camera: '48MP camera', battery: '3349mAh' }],
    ['PHN204', 'OnePlus Nord 4', 'CAT-PHONES', 'OnePlus', 'Fast-charging phone for everyday use.', 399, 4.3, '#7a2f45', { display: '6.7-inch AMOLED', storage: '256GB storage', camera: '50MP camera', battery: '5500mAh' }],
    ['AUD301', 'Sony WH-1000XM5', 'CAT-AUDIO', 'Sony', 'Over-ear headphones with noise cancellation for travel and calls.', 348, 4.7, '#1b1b1b', { type: 'Over-ear', connectivity: 'Bluetooth 5.2', battery: '30 hours' }],
    ['AUD302', 'SoundCore Life Q30', 'CAT-AUDIO', 'SoundCore', 'Affordable noise-cancelling headphones.', 79, 4.3, '#204e4a', { type: 'Over-ear', connectivity: 'Bluetooth 5.0', battery: '40 hours' }],
    ['FAS401', 'Oxford Cotton Shirt', 'CAT-MEN', 'Northline', 'Breathable cotton shirt for office days.', 45, 4.2, '#2f4a6d', { material: '100% cotton', sizeRange: 'S-XXL', care: 'Machine wash' }],
    ['FAS402', 'Merino Wool Sweater', 'CAT-MEN', 'Northline', 'Lightweight merino sweater for cooler evenings.', 79, 4.5, '#6b3f2a', { material: 'Merino wool', sizeRange: 'S-XL', care: 'Hand wash' }],
    ['FAS403', 'Pace Running Shoes', 'CAT-MEN', 'Pace', 'Daily trainers with cushioned soles.', 89, 4.4, '#c4552a', { material: 'Mesh upper', sizeRange: 'UK 6-12', use: 'Road running' }],
    ['FAS404', 'Linen Summer Dress', 'CAT-WOMEN', 'Harbor & Co', 'Relaxed linen dress for warm weather.', 69, 4.3, '#c9843f', { material: 'Linen blend', sizeRange: 'XS-XL', care: 'Machine wash cold' }],
    ['HOM501', 'MultiCook 6L', 'CAT-KITCHEN', 'HomePot', 'Pressure cooker and slow cooker for weeknight meals.', 99, 4.6, '#8c3a2f', { capacity: '6 litre', functions: 'Pressure, slow cook, saute', power: '1000W' }],
    ['HOM502', 'CrispAir Fryer 5.5', 'CAT-KITCHEN', 'CrispAir', 'Family-size air fryer with a dishwasher-safe basket.', 89, 4.4, '#b5651d', { capacity: '5.5 litre', functions: 'Air fry, roast, bake', power: '1700W' }],
    ['HOM503', 'Cyclone Vac V10', 'CAT-CLEANING', 'Cyclone', 'Cordless stick vacuum for apartments.', 249, 4.5, '#3f5c4b', { runtime: '40 minutes', type: 'Cordless stick', bin: '0.6 litre' }],
    ['BOK601', 'Effective Java', 'CAT-BOOKS', 'Addison-Wesley', 'Practical guide to modern Java programming.', 45, 4.8, '#24324a', { author: 'Joshua Bloch', format: 'Paperback', pages: '416' }],
    ['BOK602', 'Designing Data-Intensive Applications', 'CAT-BOOKS', "O'Reilly", 'Reference for storage, streams, and distributed systems.', 48, 4.8, '#6e2f2f', { author: 'Martin Kleppmann', format: 'Paperback', pages: '616' }],
    ['BOK603', 'The Pragmatic Programmer', 'CAT-BOOKS', 'Addison-Wesley', 'Habits and techniques for working developers.', 42, 4.7, '#1f3b34', { author: 'David Thomas and Andrew Hunt', format: 'Paperback', pages: '352' }],
    ['HLT701', 'Digital Thermometer', 'CAT-HEALTH', 'CareCheck', 'Fast-read digital thermometer for home use.', 15, 4.2, '#2a6f7f', { readingTime: '10 seconds', type: 'Oral and underarm' }],
    ['HLT702', 'Blood Pressure Monitor', 'CAT-HEALTH', 'CareCheck', 'Upper-arm monitor with a memory of recent readings.', 49, 4.4, '#215e63', { cuff: 'Upper arm', memory: '60 readings' }],
    ['HLT703', 'Vitamin D3 60 Tablets', 'CAT-HEALTH', 'Northlabs', 'Daily vitamin D supplement. This is not medical advice.', 12, 4.1, '#d4a017', { count: '60 tablets', strength: '2000 IU' }],
    ['GRO801', 'Arabica Coffee Beans 1kg', 'CAT-GROCERIES', 'South Roast', 'Medium roast whole beans.', 18, 4.6, '#5a3825', { weight: '1kg', roast: 'Medium', origin: 'Chikkamagaluru' }],
    ['GRO802', 'Organic Rolled Oats 1kg', 'CAT-GROCERIES', 'Field & Mill', 'Whole rolled oats for breakfast.', 8, 4.5, '#c4a35a', { weight: '1kg', type: 'Rolled oats' }],
    ['GRO803', 'Olive Oil 1L', 'CAT-GROCERIES', 'Grove', 'Extra virgin olive oil for cooking and dressing.', 16, 4.4, '#7a8f2a', { volume: '1 litre', type: 'Extra virgin' }]
  ];

  const warehouses = [
    ['WH-BLR', 'Bengaluru Fulfillment', 'Bengaluru'],
    ['WH-DEL', 'Delhi Fulfillment', 'Delhi'],
    ['WH-MUM', 'Mumbai Fulfillment', 'Mumbai']
  ];
  const insertWarehouse = database.prepare('INSERT INTO warehouses (id, name, location) VALUES (?, ?, ?)');
  const stock = {
    LAP101: [12, 8, 6],
    LAP102: [4, 3, 2],
    LAP103: [1, 1, 0],
    LAP104: [9, 7, 5],
    LAP105: [6, 4, 3],
    PHN201: [15, 10, 8],
    PHN202: [7, 5, 4],
    PHN203: [5, 2, 2],
    PHN204: [11, 6, 4],
    AUD301: [3, 2, 1],
    AUD302: [0, 0, 0],
    FAS401: [20, 14, 10],
    FAS402: [8, 6, 4],
    FAS403: [10, 9, 6],
    FAS404: [7, 5, 5],
    HOM501: [6, 4, 3],
    HOM502: [8, 5, 4],
    HOM503: [2, 2, 1],
    BOK601: [18, 12, 9],
    BOK602: [10, 8, 6],
    BOK603: [14, 9, 7],
    HLT701: [25, 20, 16],
    HLT702: [9, 6, 4],
    HLT703: [30, 22, 18],
    GRO801: [16, 12, 10],
    GRO802: [40, 28, 24],
    GRO803: [14, 11, 9]
  };
  const insertInventory = database.prepare(
    'INSERT INTO inventory (product_id, warehouse_id, quantity) VALUES (?, ?, ?)'
  );
  const insertPref = database.prepare(
    'INSERT INTO customer_preferences (customer_id, categories, brands, budget) VALUES (?, ?, ?, ?)'
  );

  const tx = database.transaction(() => {
    for (const customer of customers) insertCustomer.run(customer[0], customer[1], customer[2], passwordHash, customer[3]);
    for (const category of categories) insertCategory.run(category[0], category[1], category[2]);
    for (const warehouse of warehouses) insertWarehouse.run(...warehouse);
    for (const product of products) {
      insertProduct.run(product[0], product[1], product[2], product[3], product[4], product[5], product[6], product[7], JSON.stringify(product[8]));
      const quantities = stock[product[0]];
      warehouses.forEach((warehouse, index) => insertInventory.run(product[0], warehouse[0], quantities[index]));
    }
    insertPref.run('CUS-BASIC', JSON.stringify(['CAT-BOOKS']), JSON.stringify([]), 50);
    insertPref.run('CUS-PRIME', JSON.stringify(['CAT-LAPTOPS']), JSON.stringify(['Dell', 'Lenovo']), 1000);
    insertPref.run('CUS-PREMIUM', JSON.stringify(['CAT-PHONES']), JSON.stringify(['Samsung']), 800);

    seedOrder(database, {
      id: 'ORD-1008',
      customerId: 'CUS-BASIC',
      status: 'DELIVERED',
      orderDate: '2026-09-28T09:15:00.000Z',
      items: [
        ['BOK601', 1, 45],
        ['GRO801', 1, 18]
      ],
      events: [
        ['ORDER_PLACED', '2026-09-28T09:15:00.000Z', '2026-10-02', 'Order placed'],
        ['PROCESSING', '2026-09-28T12:00:00.000Z', '2026-10-02', 'Packed at Bengaluru Fulfillment'],
        ['SHIPPED', '2026-09-29T08:30:00.000Z', '2026-10-02', 'Handed to the carrier'],
        ['OUT_FOR_DELIVERY', '2026-10-02T04:10:00.000Z', '2026-10-02', 'Out for delivery'],
        ['DELIVERED', '2026-10-02T11:40:00.000Z', '2026-10-02', 'Delivered']
      ]
    });
    seedOrder(database, {
      id: 'ORD-2044',
      customerId: 'CUS-PRIME',
      status: 'SHIPPED',
      orderDate: '2026-10-08T06:40:00.000Z',
      items: [['LAP104', 1, 749]],
      events: [
        ['ORDER_PLACED', '2026-10-08T06:40:00.000Z', '2026-10-12', 'Order placed'],
        ['PROCESSING', '2026-10-08T10:05:00.000Z', '2026-10-12', 'Packed at Delhi Fulfillment'],
        ['SHIPPED', '2026-10-09T07:20:00.000Z', '2026-10-12', 'In transit to the destination city']
      ]
    });
    seedOrder(database, {
      id: 'ORD-3091',
      customerId: 'CUS-PREMIUM',
      status: 'PROCESSING',
      orderDate: '2026-10-10T04:05:00.000Z',
      items: [['PHN201', 1, 449]],
      events: [
        ['ORDER_PLACED', '2026-10-10T04:05:00.000Z', '2026-10-13', 'Order placed'],
        ['PROCESSING', '2026-10-10T05:30:00.000Z', '2026-10-13', 'Waiting for warehouse handover']
      ]
    });
  });
  tx();
}

function seedOrder(database, order) {
  const total = order.items.reduce((sum, item) => sum + item[1] * item[2], 0);
  database.prepare(
    'INSERT INTO orders (id, customer_id, status, total_amount, order_date) VALUES (?, ?, ?, ?, ?)'
  ).run(order.id, order.customerId, order.status, total, order.orderDate);
  const insertItem = database.prepare(
    'INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES (?, ?, ?, ?)'
  );
  for (const item of order.items) insertItem.run(order.id, item[0], item[1], item[2]);
  const insertEvent = database.prepare(
    'INSERT INTO shipment_events (id, order_id, status, event_time, estimated_delivery, note) VALUES (?, ?, ?, ?, ?, ?)'
  );
  order.events.forEach((event, index) => {
    insertEvent.run(`${order.id}-E${index + 1}`, order.id, event[0], event[1], event[2], event[3]);
  });
}

function seedKnowledge(database) {
  const count = database.prepare('SELECT COUNT(*) AS n FROM knowledge_documents').get().n;
  if (count > 0) return;
  const docs = [
    ['Laptop Return Policy', 'MARKDOWN', '2026.1', '2026-01-01', 'RETURNS', 'GLOBAL', 'laptop-return-policy.md'],
    ['Refund Policy', 'MARKDOWN', '2026.1', '2026-01-01', 'REFUNDS', 'GLOBAL', 'refund-policy.md'],
    ['Shipping and Cancellation Policy', 'MARKDOWN', '2026.1', '2026-01-15', 'SHIPPING', 'GLOBAL', 'shipping-and-cancellation-policy.md'],
    ['Membership Benefits', 'MARKDOWN', '2026.2', '2026-02-01', 'MEMBERSHIP', 'GLOBAL', 'membership-benefits.md'],
    ['Warranty Policy', 'MARKDOWN', '2026.1', '2026-01-01', 'WARRANTY', 'GLOBAL', 'warranty-policy.md'],
    ['Delivery SLA', 'MARKDOWN', '2026.1', '2026-03-01', 'SLA', 'IN', 'delivery-sla.md'],
    ['Seller Guidelines', 'MARKDOWN', '2026.1', '2026-01-01', 'SELLER', 'GLOBAL', 'seller-guidelines.md']
  ];
  for (const doc of docs) {
    const text = fs.readFileSync(path.join(__dirname, '..', 'knowledge', doc[6]), 'utf8');
    const chunks = chunkPlainText(text);
    insertDocument(database, {
      name: doc[0],
      format: doc[1],
      version: doc[2],
      effectiveDate: doc[3],
      category: doc[4],
      region: doc[5],
      uploadedBy: 'seed',
      chunks
    });
  }
}

function insertDocument(database, doc) {
  const id = `DOC-${randomUUID().slice(0, 8)}`;
  database.prepare(
    `INSERT INTO knowledge_documents
      (id, name, format, version, effective_date, category, region, approval_status, uploaded_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'APPROVED', ?, ?)`
  ).run(id, doc.name, doc.format, doc.version, doc.effectiveDate, doc.category, doc.region, doc.uploadedBy, new Date().toISOString());
  const insertChunk = database.prepare(
    `INSERT INTO document_chunks (id, document_id, chunk_index, section, text, embedding)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  doc.chunks.forEach((chunk, index) => {
    insertChunk.run(randomUUID(), id, index, chunk.section, chunk.text, JSON.stringify(embed(chunk.text)));
  });
  return id;
}

function availabilityFor(quantity) {
  if (quantity <= 0) return 'OUT_OF_STOCK';
  if (quantity <= 5) return 'LOW_STOCK';
  return 'IN_STOCK';
}

module.exports = {
  initDb,
  getDb,
  insertDocument,
  availabilityFor,
  DB_PATH
};
