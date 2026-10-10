const STOP = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'your', 'you', 'are', 'was', 'can', 'what', 'how', 'does', 'did', 'have', 'has', 'not', 'but', 'its', 'into', 'after', 'before', 'under', 'over', 'than', 'then', 'them', 'they', 'will', 'would', 'should', 'could', 'about', 'which', 'when', 'where', 'who', 'why', 'any', 'all', 'our', 'out']);

function stem(word) {
  if (word.endsWith('ies') && word.length > 4) return `${word.slice(0, -3)}y`;
  if (word.endsWith('ing') && word.length > 5) return word.slice(0, -3);
  if (word.endsWith('ed') && word.length > 4) return word.slice(0, -2);
  if (word.endsWith('s') && word.length > 4) return word.slice(0, -1);
  return word;
}

const ALIASES = {
  shipping: 'ship',
  shipped: 'ship',
  shipment: 'ship',
  shipments: 'ship',
  cancelled: 'cancel',
  canceled: 'cancel',
  cancellation: 'cancel',
  returns: 'return',
  returned: 'return',
  returning: 'return',
  refunds: 'refund',
  refunded: 'refund',
  delivered: 'delivery',
  deliveries: 'delivery',
  laptops: 'laptop',
  smartphones: 'smartphone',
  phones: 'phone',
  warranties: 'warranty'
};

function normalize(word) {
  if (ALIASES[word]) return ALIASES[word];
  return stem(word);
}

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map(normalize)
    .filter((word) => word.length > 2 && !STOP.has(word));
}

const DIM = 256;

function embed(text) {
  const vector = new Array(DIM).fill(0);
  const counts = new Map();
  for (const token of tokenize(text)) counts.set(token, (counts.get(token) || 0) + 1);
  for (const [token, count] of counts) {
    let hash = 2166136261;
    for (let i = 0; i < token.length; i += 1) {
      hash ^= token.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    const first = Math.abs(hash) % DIM;
    const second = Math.abs(Math.imul(hash, 31)) % DIM;
    vector[first] += count;
    vector[second] += count * 0.5;
  }
  let norm = 0;
  for (const value of vector) norm += value * value;
  norm = Math.sqrt(norm) || 1;
  return vector.map((value) => value / norm);
}

function cosine(left, right) {
  let score = 0;
  const size = Math.min(left.length, right.length);
  for (let i = 0; i < size; i += 1) score += left[i] * right[i];
  return score;
}

function chunkPlainText(text) {
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  let section = 'Overview';
  let buffer = [];
  const chunks = [];
  const flush = () => {
    const body = buffer.join('\n').trim();
    buffer = [];
    if (!body) return;
    const windows = splitWindow(body, 900);
    for (const window of windows) chunks.push({ section, text: window });
  };
  for (const line of lines) {
    const heading = line.match(/^#{1,3}\s+(.+)$/);
    if (heading) {
      flush();
      section = heading[1].trim();
    } else {
      buffer.push(line);
    }
  }
  flush();
  return chunks;
}

function chunkJson(raw) {
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    const error = new Error('JSON document could not be parsed.');
    error.code = 'INVALID_DOCUMENT';
    throw error;
  }
  if (Array.isArray(data)) {
    return data.map((entry, index) => ({
      section: String(entry.section || `Section ${index + 1}`),
      text: String(entry.text || entry.body || '').trim()
    })).filter((chunk) => chunk.text);
  }
  const sections = Array.isArray(data.sections) ? data.sections : [];
  const chunks = sections.map((entry, index) => ({
    section: String(entry.section || `Section ${index + 1}`),
    text: String(entry.text || '').trim()
  })).filter((chunk) => chunk.text);
  if (!chunks.length && data.text) return chunkPlainText(String(data.text));
  return chunks;
}

function splitWindow(text, size) {
  if (text.length <= size) return [text];
  const parts = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(text.length, start + size);
    if (end < text.length) {
      const breakAt = text.lastIndexOf(' ', end);
      if (breakAt > start + 200) end = breakAt;
    }
    parts.push(text.slice(start, end).trim());
    if (end >= text.length) break;
    start = Math.max(end - 120, start + 1);
  }
  return parts.filter(Boolean);
}

module.exports = {
  tokenize,
  embed,
  cosine,
  chunkPlainText,
  chunkJson
};
