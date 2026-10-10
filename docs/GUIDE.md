# ShopSmart AI — code guide

Read this before changing the code. It covers what the system is, which requirement each part satisfies, and what every source file and function does.

The design doc asked for Spring Boot and PostgreSQL with pgvector. This repo is React plus a Node API. Shopping data and document chunks live in a SQLite file. Embeddings are computed in process. An OpenAI-compatible chat key is optional.

## 1. System overview

```text
Browser  React + Vite :5173
   |  /api proxied to the API
   v
Express API :4000
   |-- catalog, cart, wishlist, preferences, orders
   |-- assistant (intent, tools, optional model rewrite)
   |-- document ingest and retrieval
   v
SQLite file  backend/data/shopsmart.sqlite
Policy files backend/knowledge/*.md
```

One Node process serves every API. The assistant calls the same functions the HTTP routes call. It does not call itself over HTTP.

Startup order in `backend/src/index.js`: load `backend/.env`, build the Express app, `initDb()` (create tables, seed if empty, ingest policy files), then listen.

Demo accounts, password `ShopSmart123` for all three:

| Email | Customer | Tier | What they illustrate |
| --- | --- | --- | --- |
| basic@shopsmart.ai | Asha Menon | Basic | Delivered order `ORD-1008` |
| prime@shopsmart.ai | Rohan Iyer | Prime | Shipped order `ORD-2044`. Cancellation is no longer available. Laptop preference, budget 1000. |
| premium@shopsmart.ai | Meera Shah | Premium | Processing order `ORD-3091`. Only this account can upload documents. |

Out of scope, matching the design: payments, live carriers, stock forecasting, promotions, pricing automation, and executing a cancellation. The assistant only explains eligibility.

## 2. Requirements and where they live

| Requirement | Implementation |
| --- | --- |
| Login and membership tier | `auth.js` login. Tiers Basic, Prime, Premium on `customers`. UI badge in `Layout.jsx`. |
| Category hierarchy | `categories.parent_id`. `listCategories` builds a tree. Shop and Preferences render it with `flatten`. |
| Search, brand and price filters, price or rating sort, pagination | `searchProducts` and `GET /api/products`. UI in `Shop.jsx`. |
| Product detail, specifications, warehouse stock | `getProduct`, `getInventory`. UI `Product.jsx`. |
| Comparison of 2 or 3 products | Ids kept in `CompareProvider` (localStorage). `compareProducts`. UI `Compare.jsx`. |
| Wishlist add and remove | `wishlist_items`. `Wishlist.jsx` and the card button. |
| Cart add, quantity, remove, total | `cart_items`. Stock is checked. `Cart.jsx`. |
| Preferences: categories, brands, budget | `customer_preferences`. `Preferences.jsx`. Recommendations read them. |
| Responsive layout | `styles.css` stacks the nav, filters, and product grid under 900px. |
| Shopping assistant | `POST /api/ai/recommendations` → `recommend`. UI Assistant, Products mode. |
| Understand intent, extract budget and use, explain, check stock | `extractRequirements`, `recommendFromCatalog`, `reasonFor`, `getInventory`. |
| Clarifying question when the product type is missing | `extractRequirements` sets `clarifyingQuestion` and returns no products. |
| Recommendations are real catalog rows inside the budget | `searchProducts` filters `price <= budget`. `guardRecommendation` drops any product id the model invents. |
| Policy answers only from approved documents | `searchEvidence` filters `approval_status = 'APPROVED'`. |
| Upload PDF, Markdown, JSON with version, date, category, region | `documents.js`. Premium only. |
| Chunk, embed, retrieve, cite document, section, version | `text.js`, `rag.js`, `insertDocument`. |
| Confidence HIGH / MEDIUM / LOW and follow-up when evidence is weak | `confidenceFor`. LOW returns a fixed “not enough evidence” sentence and no sources. |
| Order and shipment lookup for the signed-in customer | `orders.js`. Another customer’s id returns 403. |
| One assistant coordinates product, inventory, order, and policy tools | `chat` plus `intentOf`. |
| Combined question does not cancel the order | `chat` appends an eligibility sentence only. |
| Explainability | Assistant “Why this answer” panel shows tool calls. `audit_records` stores request, response, model, tools, sources, outcome, time. UI `Audit.jsx`. |
| Shopping still works if the model is down | Empty `OPENAI_API_KEY` skips the model. A timeout or HTTP error falls back to the local result and sets `warning`. |
| Validation and a common error shape | `http.js`. Body is `{ code, message }`. |
| Hashed passwords, model key only in env | bcrypt in `customers.password_hash`. Keys read from `backend/.env`. |
| Only the demo uploader can upload | `requireUploader` compares email with `DEMO_UPLOADER_EMAIL`. |
| Document text is evidence, not instructions | Local answers quote sentences. The model prompt says the same. Nothing in a document is executed. |

Product cards are colored blocks (`image_color`), not photograph files. The case study lists images; this build stores a color and paints it in `ProductCard.jsx`.

Availability from total warehouse quantity: `IN_STOCK` above 5, `LOW_STOCK` from 1 to 5, `OUT_OF_STOCK` at 0. `availabilityFor`.

## 3. Data model

SQLite file `backend/data/shopsmart.sqlite`, created on first boot. Tables from `migrate`:

| Table | Fields that matter |
| --- | --- |
| customers | id, name, email, password_hash, membership_tier |
| categories | id, name, parent_id |
| products | id, name, category_id, brand, description, price, rating, image_color, specifications (JSON text) |
| warehouses | id, name, location. Seeded: Bengaluru, Delhi, Mumbai. |
| inventory | product_id, warehouse_id, quantity |
| customer_preferences | customer_id, categories JSON, brands JSON, budget |
| wishlist_items | customer_id, product_id |
| cart_items | customer_id, product_id, quantity > 0 |
| orders | id, customer_id, status, total_amount, order_date |
| order_items | order_id, product_id, quantity, unit_price (snapshot) |
| shipment_events | id, order_id, status, event_time, estimated_delivery, note |
| knowledge_documents | id, name, format, version, effective_date, category, region, approval_status, uploaded_by, created_at |
| document_chunks | id, document_id, chunk_index, section, text, embedding (JSON of 256 numbers) |
| audit_records | id, customer_id, endpoint, request, ai_response, model_name, tool_activity, source_references, outcome, created_at |

Seeded orders: `ORD-1008` DELIVERED (Asha), `ORD-2044` SHIPPED (Rohan), `ORD-3091` PROCESSING (Meera). Shipment statuses used: `ORDER_PLACED`, `PROCESSING`, `SHIPPED`, `OUT_FOR_DELIVERY`, `DELIVERED`.

Seeded policies in `backend/knowledge/`: Laptop Return Policy, Refund Policy, Shipping and Cancellation Policy, Membership Benefits, Warranty Policy, Delivery SLA (region `IN`), Seller Guidelines. Each is approved, version `2026.1` or `2026.2`.

`backend/samples/warranty-excerpt.json` is a sample upload. Shape: `{ sections: [{ section, text }] }`.

## 4. How a request moves

1. The page calls a method on `api` in `frontend/src/api.js`.
2. `request` adds `Authorization: Bearer` from `localStorage` key `shopsmart-token` and parses JSON errors into `Error` with `code` and `status`.
3. Vite proxies `/api` to port 4000 (`frontend/vite.config.js`).
4. Public routes: `GET /api/health`, `POST /api/auth/login`. Everything else uses `requireAuth`.
5. `app.use('/api', requireAuth, shopping)` runs first. If `routes.js` has no match, Express continues to documents, AI, and audit routes.
6. Handlers throw `HttpError`. `errorMiddleware` turns that into `{ code, message }`. Unknown errors become `INTERNAL_ERROR`. Multer’s size limit becomes `INVALID_DOCUMENT`.

Auth token: JWT, 12 hours, payload `{ sub, email }`. `requireAuth` checks the signature, then reloads the customer from the database. The signing secret is `JWT_SECRET`, or `shopsmart-dev-secret-change-me` if unset. The browser stores the token in `localStorage`.

## 5. Assistant and retrieval

Product question (`recommend`):

1. `extractRequirements` finds a product type from `PRODUCT_TYPES`, a budget (`under 1000`, `$1000`, or the saved preference), and the phrase after “for”.
2. No type → `clarifyingQuestion` set, `recommendations` empty. No catalog lookup.
3. `searchProducts` with that category and `maxPrice`. Rank by rating, query-word overlap, preferred brand, stock, and a RAM boost when the message mentions Java, development, or AI.
4. Top 3. `reasonFor` uses RAM, processor, and storage when the question is about development or AI. Otherwise the first three specification values.
5. `getInventory` supplies `availability`.
6. If `OPENAI_API_KEY` is set, `maybeRewrite` asks the model to rephrase. `guardRecommendation` keeps only product ids from the local list and always keeps local price, name, and availability.

Policy question (`askKnowledge`):

1. `embed` hashes words into 256 numbers. `searchEvidence` cosine-compares that with every approved chunk and adds 0.08 per shared word. Optional `category` and `region` filters. Region `GLOBAL` still matches a specific region filter.
2. `confidenceFor`: LOW if overlap < 2 or score < 0.28. HIGH if overlap ≥ 3 and score ≥ 0.45. Otherwise MEDIUM.
3. `answerFromEvidence` returns the one or two sentences with the most shared words, plus their document, section, and version. `followUpRequired` is true unless confidence is HIGH.
4. A model rewrite may change wording. Citations must still match the local sources. A LOW local result is never replaced by the model.

Combined chat (`chat` + `intentOf`):

- Order words and policy words → `combined`. Load only this customer’s orders, then the policy answer. If the latest order is `SHIPPED`, `OUT_FOR_DELIVERY`, or `DELIVERED`, the text says cancellation is not executed. If it is still `PROCESSING`, the text says eligibility is informational only.
- Order words only → order summary.
- Shopping words and no policy words → `recommend`.
- Otherwise → policy answer.

`recordAudit` writes one row per AI call. Outcomes: `ANSWERED`, `CLARIFY`, `INSUFFICIENT_EVIDENCE`.

## 6. Backend files

### `backend/package.json`

Scripts: `start` runs `node src/index.js`. `dev` runs `node --watch src/index.js`. Dependencies: express, cors, dotenv, bcryptjs, jsonwebtoken, multer, pdf-parse, sql.js.

### `backend/.env.example`

`PORT`, `JWT_SECRET`, `CLIENT_ORIGIN`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_BASE_URL`, `DEMO_UPLOADER_EMAIL`. Copy to `backend/.env`. The real `.env` is gitignored.

### `backend/src/index.js`

Wires HTTP. No business logic.

| Piece | Role |
| --- | --- |
| dotenv load | Reads `backend/.env` by absolute path, so the process cwd does not matter. |
| `GET /api/health` | `{ status: 'ok', ai: 'model' or 'local-reasoner' }`. |
| `POST /api/auth/login` | Validates email and password, returns `{ token, customer }`. |
| `GET /api/auth/me` | Returns the customer on the token. |
| `app.use('/api', requireAuth, shopping)` | Mounts catalog, cart, wishlist, preferences, orders. |
| `GET /api/documents` | Any signed-in customer can list documents. |
| `POST /api/documents` | Uploader only. |
| `POST /api/ai/recommendations` | `assertMessage`, `recommend`, `recordAudit`. Outcome `CLARIFY` when there is a question and no products. |
| `POST /api/ai/knowledge` | Body field `question` or `message`. Optional `category`, `region`. |
| `POST /api/ai/chat` | `chat`, then audit. |
| `GET /api/audit` | Last 50 rows for this customer. |
| final `/api` handler | 404 `{ code: 'NOT_FOUND' }`. |
| `initDb().then(listen)` | Port `PORT` or 4000. Logs `ShopSmart API listening`. Exit 1 if the database fails. |

### `backend/src/http.js`

| Function | Role |
| --- | --- |
| `HttpError` | `status`, `code`, `message`. |
| `asyncHandler` | Forwards rejected promises to the error middleware. |
| `errorMiddleware` | `HttpError` → its status. `INVALID_DOCUMENT` → 400. `LIMIT_FILE_SIZE` → 400 file-too-big. Else 500 `INTERNAL_ERROR`. |
| `requireString` | Trimmed string, length between min and max, else `INVALID_REQUEST`. |
| `optionalString` | Null if empty. Rejects non-strings and overlong strings. |
| `requirePositiveInt` | Integer from 1 to max. |
| `optionalNumber` | Null if empty. Finite and ≥ 0. |

### `backend/src/auth.js`

| Function | Role |
| --- | --- |
| `signCustomer` | JWT for 12 hours. |
| `publicCustomer` | `{ id, name, email, membershipTier, canUploadDocuments }`. Upload flag is email equality with `DEMO_UPLOADER_EMAIL`. |
| `login` | Lookup by lowercased email. `bcrypt.compareSync`. Wrong email and wrong password share one 401 `INVALID_CREDENTIALS`. |
| `requireAuth` | Bearer token required. Invalid or unknown customer → 401. Sets `req.customer`. |
| `requireUploader` | 403 `FORBIDDEN` when `canUploadDocuments` is false. |

### `backend/src/sqlite.js`

A small stand-in for the better-sqlite3 API, backed by sql.js, so the API does not need a compiled native addon.

| Piece | Role |
| --- | --- |
| `Statement.run` | Execute a write with `?` params, then persist the file. |
| `Statement.get` | First row, or `undefined`. |
| `Statement.all` | Every row. |
| `ShopDatabase.exec` | Run a SQL script, then persist. |
| `ShopDatabase.pragma` | `PRAGMA <value>`. |
| `ShopDatabase.prepare` | Returns a `Statement`. |
| `ShopDatabase.transaction` | Returns a function that `BEGIN`s, runs the callback, `COMMIT`s, or `ROLLBACK`s. Writes inside the transaction skip `persist` until commit. |
| `ShopDatabase.persist` | `export()` the database and write `backend/data/shopsmart.sqlite`. No-op while `inTx` is true. |
| `openDatabase` | Load `sql-wasm.wasm`, open the file if it exists, otherwise an empty database. |

### `backend/src/db.js`

| Function | Role |
| --- | --- |
| `initDb` | Make `backend/data`, open SQLite, `PRAGMA foreign_keys = ON`, `migrate`, `seed`, `seedKnowledge`. Later calls return the same handle. |
| `getDb` | The open database. Throws if `initDb` has not finished. |
| `migrate` | `CREATE TABLE IF NOT EXISTS` for every table in section 3. |
| `seed` | If `customers` is empty, insert 3 customers (bcrypt cost 10), the category tree, 3 warehouses, 27 products, inventory, preferences, and 3 orders inside one transaction. |
| `seedOrder` | Insert the order, line items, total, and shipment events. |
| `seedKnowledge` | If no documents exist, read each file in `backend/knowledge`, chunk it, and `insertDocument` as `APPROVED`. |
| `insertDocument` | New id `DOC-` plus 8 hex chars. Insert the document and one chunk row per section, with `embed(text)` stored as JSON. Used by seed and by upload. |
| `availabilityFor` | Map a quantity to `OUT_OF_STOCK`, `LOW_STOCK`, or `IN_STOCK`. |

### `backend/src/text.js`

| Piece | Role |
| --- | --- |
| `STOP` | Words dropped before embedding and overlap counts. |
| `stem` | Light suffix trim (`ies`, `ing`, `ed`, `s`). |
| `ALIASES` | Map `shipped`/`shipping`/`shipment` to `ship`, and the same idea for return, refund, cancel, delivery, laptop, phone, warranty. |
| `normalize` | Alias, otherwise `stem`. |
| `tokenize` | Lowercase, split on non-alphanumerics, normalize, drop short words and `STOP`. |
| `embed` | 256-dimensional unit vector. Each token is hashed into two buckets. This is a word fingerprint, not a hosted embedding model. |
| `cosine` | Dot product. Vectors are already unit length. |
| `chunkPlainText` | Split on Markdown headings (`#` to `###`). The heading is the section name. Body windows are about 900 characters with a small overlap via `splitWindow`. |
| `chunkJson` | Array of `{ section, text }`, or `{ sections: [...] }`, or `{ text }` passed to `chunkPlainText`. Bad JSON throws `INVALID_DOCUMENT`. |
| `splitWindow` | Break long text on a space near the size limit, overlap about 120 characters. |

### `backend/src/catalog.js`

| Function | Role |
| --- | --- |
| `categoryIdsIncludingChildren` | The category plus every descendant. Unknown id → 400. |
| `stockByProduct` | Sum of `inventory.quantity` per product. |
| `mapProduct` | API product shape: ids, names, price, rating, `imageColor`, parsed specifications, `stockQuantity`, `availability`. |
| `PRODUCT_SELECT` | `products` joined to `categories` for `category_name`. |
| `listCategories` | Nested `{ id, name, parentId, children }`. |
| `searchProducts` | `search` matches name, brand, description, specifications. Filters: category subtree, brand, minPrice, maxPrice. Sort whitelist: `price_asc`, `price_desc`, `rating_asc`, `rating_desc` (default rating desc). Page and size. Also `facets.brands`. |
| `getProduct` | One product or 404 `NOT_FOUND`. |
| `compareProducts` | 2 or 3 unique ids, else 400. |
| `getInventory` | Per-warehouse quantities plus total and availability. |
| `getPreferences` | Stored JSON, or empty lists and null budget. |
| `savePreferences` | Up to 12 category ids that must exist, up to 12 brand strings, budget 0–100000. Upsert. |
| `listWishlist` / `addWishlist` / `removeWishlist` | The customer’s saved products. Add is idempotent (`INSERT OR IGNORE`). |
| `mapCart` | Lines with `quantity` and `lineTotal`, plus `total`. |
| `addCartItem` | Rejects out-of-stock and quantities above on-hand stock (`409 OUT_OF_STOCK`). Adds to an existing line. |
| `updateCartItem` | Sets quantity. 404 if the line is missing. Same stock check. |
| `removeCartItem` | Deletes the line. |

### `backend/src/orders.js`

| Function | Role |
| --- | --- |
| `listOrders` | This customer’s orders, newest first. Summary only. |
| `getOrder` | 404 if missing. 403 `FORBIDDEN` if `customer_id` is not the caller. Includes items and shipment events in time order. |
| `summarize` | `{ orderId, status, totalAmount, orderDate }`. |

### `backend/src/routes.js`

Thin handlers. All require the auth middleware mounted in `index.js`.

| Route | Calls |
| --- | --- |
| `GET /categories` | `listCategories` |
| `GET /products/compare?ids=a,b` | `compareProducts`. Registered before `/:id`. |
| `GET /products/:id` | `getProduct` |
| `GET /products` | Validates page, size (max 24), sort, search, category, brand, minPrice, maxPrice. Then `searchProducts`. |
| `GET /inventory/:productId` | `getInventory` |
| `GET` and `PUT /preferences` | `getPreferences`, `savePreferences` |
| `GET` and `POST /wishlist`, `DELETE /wishlist/:productId` | list, add, remove |
| `GET /cart`, `POST /cart/items`, `PUT` and `DELETE /cart/items/:productId` | `mapCart`, `addCartItem`, `updateCartItem`, `removeCartItem`. Quantity 1–20. |
| `GET /orders`, `GET /orders/:id` | `listOrders`, `getOrder` |

### `backend/src/documents.js`

| Piece | Role |
| --- | --- |
| `upload` | Multer memory storage, 5 MB. |
| `formatOf` | `.pdf` → `PDF`, `.md` / `.markdown` → `MARKDOWN`, `.json` → `JSON`, else null. |
| `extractText` | PDF via `pdf-parse`. Markdown and JSON as UTF-8. |
| `documentsRouter` | `POST /` requires `file`, `version`, `effectiveDate` (`YYYY-MM-DD`), `category`, `region`, and optional `name` (filename stem if omitted). Chunks, writes the original bytes under `backend/uploads/<timestamp>-<safe name>`, inserts an `APPROVED` document. Response `{ documentId, ingestionStatus: 'READY', chunks }`. |

### `backend/src/rag.js`

| Function | Role |
| --- | --- |
| `searchEvidence` | Embed the question, score approved chunks, return the top matches with document, section, version, text, score, overlap. |
| `sentencesOf` | Split on `.`, `!`, `?`. |
| `confidenceFor` | HIGH, MEDIUM, or LOW from the best chunk’s overlap and score. |
| `answerFromEvidence` | The grounded `{ answer, confidence, sources, followUpRequired, evidence }`. |
| `listDocuments` | Metadata plus chunk count, newest first. |

### `backend/src/assistant.js`

| Piece | Role |
| --- | --- |
| `PRODUCT_TYPES` | Words → category id (`laptop` → `CAT-LAPTOPS`, and the same for phones, audio, books, kitchen, cleaning, fashion, healthcare, groceries). |
| `extractRequirements` | Type, budget, use-phrase, `interpretedRequirement` (`Laptop for …`), or a clarifying question. |
| `reasonFor` | Specification phrase used as the recommendation reason. |
| `recommendFromCatalog` | Preferences, search, rank, inventory checks, tool trace. |
| `publicKnowledge` | Drops internal `evidence` before a knowledge JSON response. The audit still stores the wrapper that includes `tools`. |
| `maybeRewrite` | No key → `{ model: 'shopsmart-local-reasoner' }`. Otherwise `POST {OPENAI_BASE_URL}/chat/completions` with `response_format: json_object`, 20s timeout, temperature 0.1. Failure or timeout returns the local payload plus `warning`. |
| `guardRecommendation` | Model output may only contain local product ids. Local availability, price, and name win. |
| `recommend` | Local result, optional rewrite, then the guard. |
| `askKnowledge` | Local evidence answer, optional rewrite. Model citations must match local sources. LOW local answers are kept as-is. |
| `intentOf` | `combined`, `order`, `shopping`, or `knowledge`. |
| `chat` | Runs the tools for that intent and joins the sentences into `answer`. Also returns `recommendations`, `knowledge`, `orders`, `tools`, `model`, `warning`. |
| `recordAudit` | Insert one `audit_records` row. |
| `listAudit` | Last 50 for this customer, parsed JSON. |
| `assertMessage` | 3–2000 characters, else 400. |

## 7. Frontend files

### `package.json` (repo root)

`install:all` installs backend and frontend. `dev` runs both through `concurrently`, labeled `[api]` and `[web]`. `start` starts only the API.

### `frontend/package.json` and `frontend/vite.config.js`

React 19, React DOM 19, React Router 7. Scripts: `dev`, `build`, `preview`. Vite listens on 5173 and proxies `/api` to `http://localhost:4000`.

### `frontend/index.html`

Mounts `#root`, loads `src/main.jsx`, and loads Fraunces and Source Sans 3 from Google Fonts.

### `frontend/src/main.jsx`

`createRoot`. Wraps `App` in `BrowserRouter`, `AuthProvider`, `CompareProvider`.

### `frontend/src/api.js`

| Piece | Role |
| --- | --- |
| `getToken` / `setToken` | Read or clear `localStorage` `shopsmart-token`. |
| `request` | `fetch` with the bearer token. JSON body unless the body is `FormData`. Throws `Error` with `code` and `status` when `response.ok` is false. |
| `api.login` … `api.audit` | One function per endpoint. Names match the methods listed in section 4. |
| `money` | USD via `Intl.NumberFormat`. |
| `when` | Locale date and time. Returns the raw string if it is not a date. |

### `frontend/src/auth.jsx`

| Piece | Role |
| --- | --- |
| `AuthProvider` | On load, `api.me()` if a token exists. Failure clears the token. `login` stores the token and customer. `logout` clears both. |
| `useAuth` | `{ customer, ready, login, logout }`. |
| `CompareProvider` | Up to 3 product ids in `localStorage` `shopsmart-compare`. `toggle` adds or removes. A fourth id is ignored. `clear` empties the list. |
| `useCompare` | `{ ids, toggle, clear }`. |

### `frontend/src/App.jsx`

| Piece | Role |
| --- | --- |
| `Guard` | Waits for `ready`. No customer → redirect to `/login`, remembering the path. |
| `App` | `/login` is public. All other routes render inside `Guard` and `Layout`: `/` shop, `/product/:id`, `/compare`, `/wishlist`, `/cart`, `/orders`, `/orders/:id`, `/assistant`, `/knowledge`, `/preferences`, `/audit`. Unknown paths redirect to `/`. |

### `frontend/src/components/Layout.jsx`

| Piece | Role |
| --- | --- |
| `links` | Shop, Orders, Assistant, Policies, Audit. |
| `Layout` | Brand, membership badge, first name → preferences, wishlist, cart count, sign out. Cart count reloads on every path change. `Outlet` context `{ refreshCart }` so product pages can update the badge. Mobile `menu` toggles `.nav.open`. Sticky compare bar when at least one id is selected. |

### `frontend/src/components/ProductCard.jsx`

`ProductCard({ product, wished, onWish, onCart })`. Color block links to the product. Shows id, availability, name, description, price, rating. Buttons: add to cart (disabled when `OUT_OF_STOCK`), wishlist, compare toggle.

### `frontend/src/pages/Login.jsx`

| Piece | Role |
| --- | --- |
| `demos` | Buttons that fill `basic@`, `prime@`, or `premium@shopsmart.ai`. |
| `Login` | If already signed in, redirect to the saved path or `/`. `submit` calls `login`. Shows the error message. Default fields are the Prime account. |

### `frontend/src/pages/Shop.jsx`

| Piece | Role |
| --- | --- |
| `flatten` | Category tree → `{ id, name, depth }` for the select. |
| `Shop` | Loads categories and wishlist once. Reloads products whenever `query` changes. Query fields: search, category, brand, minPrice, maxPrice, sort, page. `onWish` adds or removes. `onCart` posts quantity 1 and refreshes the badge. Brand options come from `facets.brands`. Pager uses `page` and `totalPages`. |

### `frontend/src/pages/Product.jsx`

`Product`. Loads product, inventory, and whether it is wishlisted. Add to cart, toggle wishlist, toggle compare. Renders every specification and each warehouse quantity.

### `frontend/src/pages/Compare.jsx`

`Compare`. Fewer than 2 selected ids → empty state. Otherwise `api.compare` and a table of id, brand, price, rating, availability, and the union of specification keys.

### `frontend/src/pages/Wishlist.jsx`

`Wishlist`. `load` on mount. Remove calls `removeWishlist` then `load`. Add to cart uses the same stock error display as the shop.

### `frontend/src/pages/Cart.jsx`

`Cart`. `load` on mount. `change` decrements, increments, or removes when quantity would drop below 1. Shows line totals and the cart total. Copy states that payment is out of scope.

### `frontend/src/pages/Orders.jsx`

`Orders`. Lists `orderId`, date, status, total. Each row links to `/orders/:id`.

### `frontend/src/pages/OrderDetail.jsx`

`OrderDetail`. Items and a timeline of shipment events: status, time, note, estimated delivery.

### `frontend/src/pages/Assistant.jsx`

| Piece | Role |
| --- | --- |
| `prompts` | Fills the box with the laptop recommendation, the opened-laptop return question, or the order-plus-cancellation question. |
| `Assistant` | Modes `chat` → `api.chat`, `recommend` → `api.recommend`, `knowledge` → `api.knowledge`. Renders `answer`, recommendation cards, knowledge confidence and sources, `warning`, and the tool trace. |

### `frontend/src/pages/Knowledge.jsx`

`Knowledge`. `load` lists documents for every customer. The upload form renders only when `customer.canUploadDocuments`. `upload` sends `FormData` (`name`, `version`, `effectiveDate`, `category`, `region`, `file`) and shows the new id and chunk count.

### `frontend/src/pages/Preferences.jsx`

| Piece | Role |
| --- | --- |
| `flatten` | Same tree flattening as the shop, with the depth prefix in the label. |
| `Preferences` | Loads categories and current preferences. `toggle` checks a category. `save` splits brands on commas and sends a number or null budget. |

### `frontend/src/pages/Audit.jsx`

`Audit`. One `<details>` per record: endpoint, outcome, time, model, request JSON, tool JSON, source JSON.

### `frontend/src/styles.css`

Global tokens on `:root` (paper background, green actions, clay eyebrow). Then layout (`.topbar`, `.nav`, `.page`, `.shop-layout`, `.assistant`, `.login-screen`), surfaces (`.panel`, `.product-card`, `.swatch`), catalog controls, tables, cart and order rows, the shipment timeline, confidence colors (`.high`, `.medium`, `.low`), and the compare bar. The `@media (max-width: 900px)` block shows the menu button, hides the desktop nav until `.open`, stacks the shop and assistant, and hides filters until `.filters.open`.

## 8. Knowledge files

These are the approved corpus. Headings are the citation sections.

| File | Document name | What a demo question should hit |
| --- | --- | --- |
| `laptop-return-policy.md` | Laptop Return Policy 2026.1 | “Opened Products”: opened laptops, 7 days, no physical damage. |
| `refund-policy.md` | Refund Policy 2026.1 | Refunds in 5 to 7 business days after warehouse inspection. |
| `shipping-and-cancellation-policy.md` | Shipping and Cancellation Policy 2026.1 | Prime free standard delivery. Cancel only before status Shipped. |
| `membership-benefits.md` | Membership Benefits 2026.2 | Basic paid shipping, Prime free standard, Premium free express. |
| `warranty-policy.md` | Warranty Policy 2026.1 | Smartphones: 12 months, manufacturing defects, physical and liquid damage excluded. |
| `delivery-sla.md` | Delivery SLA 2026.1, region IN | Standard 3–5 business days, express 1–2. |
| `seller-guidelines.md` | Seller Guidelines 2026.1 | Listing accuracy and warehouse handover in 1 business day. |

## 9. Errors you will see

| code | When |
| --- | --- |
| `INVALID_CREDENTIALS` | Login failed. |
| `UNAUTHORIZED` | Missing, bad, or expired token. |
| `FORBIDDEN` | Order belongs to someone else, or a non-uploader tried to upload. |
| `INVALID_REQUEST` | Bad quantity, sort, date, budget, category, or message length. |
| `NOT_FOUND` | Unknown product, cart line, order, or URL. |
| `OUT_OF_STOCK` | Add or update exceeds warehouse quantity, or the product is already at 0. |
| `INVALID_DOCUMENT` | Wrong file type, empty text, bad JSON, or file over 5 MB. |
| `INTERNAL_ERROR` | Anything else. The server logs the stack. |

If the browser shows `ECONNREFUSED 127.0.0.1:4000`, Vite is up and the API is not. The `[api]` lines above that proxy error are the reason.
