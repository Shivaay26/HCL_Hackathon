const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const express = require('express');
const cors = require('cors');
const { login, requireAuth, requireUploader } = require('./auth');
const { asyncHandler, errorMiddleware, requireString } = require('./http');
const shopping = require('./routes');
const { documentsRouter } = require('./documents');
const { recommend, askKnowledge, chat, recordAudit, listAudit, assertMessage } = require('./assistant');
const { listDocuments } = require('./rag');
const { initDb } = require('./db');

const app = express();
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', ai: process.env.OPENAI_API_KEY ? 'model' : 'local-reasoner' });
});

app.post('/api/auth/login', asyncHandler(async (req, res) => {
  const email = requireString(req.body?.email, 'Email', { max: 120 });
  const password = requireString(req.body?.password, 'Password', { max: 200 });
  res.json(login(email, password));
}));

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ customer: req.customer });
});

app.use('/api', requireAuth, shopping);
app.get('/api/documents', requireAuth, asyncHandler(async (req, res) => {
  res.json({ items: listDocuments() });
}));
app.use('/api/documents', requireAuth, requireUploader, documentsRouter());

app.post('/api/ai/recommendations', requireAuth, asyncHandler(async (req, res) => {
  const message = assertMessage(req.body?.message);
  const result = await recommend(message, req.customer.id);
  recordAudit(req.customer.id, 'recommendations', { message }, result, result.clarifyingQuestion && !result.recommendations.length ? 'CLARIFY' : 'ANSWERED');
  res.json(result);
}));

app.post('/api/ai/knowledge', requireAuth, asyncHandler(async (req, res) => {
  const question = assertMessage(req.body?.question || req.body?.message);
  const category = typeof req.body?.category === 'string' && req.body.category.trim() ? req.body.category.trim().toUpperCase() : undefined;
  const region = typeof req.body?.region === 'string' && req.body.region.trim() ? req.body.region.trim().toUpperCase() : undefined;
  const result = await askKnowledge(question, { category, region });
  recordAudit(req.customer.id, 'knowledge', { question, category, region }, result, result.confidence === 'LOW' ? 'INSUFFICIENT_EVIDENCE' : 'ANSWERED');
  res.json(result);
}));

app.post('/api/ai/chat', requireAuth, asyncHandler(async (req, res) => {
  const message = assertMessage(req.body?.message);
  const result = await chat(message, req.customer.id);
  const outcome = result.knowledge?.confidence === 'LOW' ? 'INSUFFICIENT_EVIDENCE' : 'ANSWERED';
  recordAudit(req.customer.id, 'chat', { message }, result, outcome);
  res.json(result);
}));

app.get('/api/audit', requireAuth, asyncHandler(async (req, res) => {
  res.json({ items: listAudit(req.customer.id) });
}));

app.use('/api', (req, res) => {
  res.status(404).json({ code: 'NOT_FOUND', message: 'That API was not found.' });
});
app.use(errorMiddleware);

const port = Number(process.env.PORT || 4000);
initDb().then(() => {
  app.listen(port, () => {
    console.log(`ShopSmart API listening on ${port}`);
  });
}).catch((error) => {
  console.error('ShopSmart API failed to start.');
  console.error(error);
  process.exit(1);
});
