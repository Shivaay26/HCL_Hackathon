const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { insertDocument } = require('./db');
const { chunkPlainText, chunkJson } = require('./text');
const { HttpError, asyncHandler, requireString } = require('./http');

const uploadDir = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
});

function formatOf(filename) {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.pdf')) return 'PDF';
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'MARKDOWN';
  if (lower.endsWith('.json')) return 'JSON';
  return null;
}

async function extractText(file, format) {
  if (format === 'PDF') {
    const pdfParse = require('pdf-parse');
    const parsed = await pdfParse(file.buffer);
    return parsed.text || '';
  }
  return file.buffer.toString('utf8');
}

function documentsRouter() {
  const router = require('express').Router();
  router.post('/', upload.single('file'), asyncHandler(async (req, res) => {
    if (!req.file) throw new HttpError(400, 'INVALID_DOCUMENT', 'Choose a PDF, Markdown, or JSON file.');
    const format = formatOf(req.file.originalname);
    if (!format) throw new HttpError(400, 'INVALID_DOCUMENT', 'Upload a .pdf, .md, or .json file.');
    const version = requireString(req.body?.version, 'Version', { max: 40 });
    const effectiveDate = requireString(req.body?.effectiveDate, 'Effective date', { max: 40 });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) {
      throw new HttpError(400, 'INVALID_REQUEST', 'Effective date must be YYYY-MM-DD.');
    }
    const category = requireString(req.body?.category, 'Category', { max: 40 }).toUpperCase();
    const region = requireString(req.body?.region, 'Region', { max: 40 }).toUpperCase();
    const name = requireString(req.body?.name || req.file.originalname.replace(/\.[^.]+$/, ''), 'Document name', { max: 120 });
    const raw = await extractText(req.file, format);
    const chunks = format === 'JSON' ? chunkJson(raw) : chunkPlainText(raw);
    if (!chunks.length) throw new HttpError(400, 'INVALID_DOCUMENT', 'No readable text was found in that file.');
    const savedName = `${Date.now()}-${req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    fs.writeFileSync(path.join(uploadDir, savedName), req.file.buffer);
    const documentId = insertDocument(require('./db').getDb(), {
      name,
      format,
      version,
      effectiveDate,
      category,
      region,
      uploadedBy: req.customer.id,
      chunks
    });
    res.status(201).json({ documentId, ingestionStatus: 'READY', chunks: chunks.length });
  }));
  return router;
}

module.exports = { documentsRouter };
