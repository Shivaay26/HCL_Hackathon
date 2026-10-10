# ShopSmart AI

ShopSmart is a small e-commerce assistant: a React shop, a Node API, and one assistant that recommends catalog products, answers from approved documents, and reads simulated orders.

The solution design described a Java Spring Boot service. This implementation keeps the same screens, data, and API behavior, and uses Node.js because that was the requested backend.

## Run it

Use Ubuntu / WSL from the project folder.

```bash
cp backend/.env.example backend/.env
npm run install:all
npm run dev
```

Open http://localhost:5173

The API listens on http://localhost:4000. The Vite dev server proxies `/api` to it.

Demo password for every account: `ShopSmart123`

| Email | Membership | What to show |
| --- | --- | --- |
| basic@shopsmart.ai | Basic | Delivered order ORD-1008 |
| prime@shopsmart.ai | Prime | Shipped order ORD-2044. Cancellation is no longer available. |
| premium@shopsmart.ai | Premium | Processing order ORD-3091. This account can upload documents. |

Delete `backend/data/shopsmart.sqlite` if you want a clean reseed.

## Demo script

1. Sign in as Rohan (`prime@shopsmart.ai`).
2. Shop: search `laptop`, filter Electronics or Laptops, sort by price, page through results.
3. Compare two laptops, save one to the wishlist, and add one to the cart. Change the quantity.
4. Open Preferences and confirm laptops, Dell, Lenovo, and a $1000 budget.
5. Assistant, Products mode: `Suggest a laptop under $1000 for Java development and AI projects.`
6. Assistant, Policies mode: `Can I return an opened laptop?` Also try the refund, Prime delivery, and smartphone warranty questions.
7. Assistant, Combined mode: `Where is my order, and can I cancel after shipment?`
8. Open the order timeline, then Audit. The audit row shows the tools, sources, model, and time.
9. Sign in as Meera (`premium@shopsmart.ai`) and upload `backend/samples/warranty-excerpt.json` from Policies.

Without `OPENAI_API_KEY`, answers come from the local reasoner: catalog filters plus sentences retrieved from approved documents. With a key, the model may rewrite the wording. Product ids, stock, and citations still have to match the local evidence.

## Layout

```text
frontend/     React 19 + Vite
backend/src   Express API, SQLite, recommendations, retrieval, audit
backend/knowledge   Approved markdown seeded on first launch
docs/architecture.md
```

Shopping data lives in SQLite. Document chunks store a local 256-number embedding and are ranked in the API process. That keeps the demo runnable without PostgreSQL or a vector database. See the questions at the end of the architecture note if the review environment requires pgvector.
