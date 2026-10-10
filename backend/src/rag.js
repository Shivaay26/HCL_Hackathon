const { getDb } = require('./db');
const { embed, cosine, tokenize } = require('./text');

function searchEvidence(question, { category, region } = {}, limit = 4) {
  const queryVector = embed(question);
  const queryTokens = new Set(tokenize(question));
  let rows = getDb().prepare(
    `SELECT c.id, c.section, c.text, c.embedding, d.name, d.version, d.category, d.region
     FROM document_chunks c
     JOIN knowledge_documents d ON d.id = c.document_id
     WHERE d.approval_status = 'APPROVED'`
  ).all();
  if (category) rows = rows.filter((row) => row.category === category);
  if (region) rows = rows.filter((row) => row.region === region || row.region === 'GLOBAL');
  return rows
    .map((row) => {
      const overlap = tokenize(row.text).filter((token) => queryTokens.has(token));
      const uniqueOverlap = new Set(overlap).size;
      const score = cosine(queryVector, JSON.parse(row.embedding)) + uniqueOverlap * 0.08;
      return {
        chunkId: row.id,
        document: row.name,
        section: row.section,
        version: row.version,
        category: row.category,
        region: row.region,
        text: row.text,
        score: Number(score.toFixed(4)),
        overlap: uniqueOverlap
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function sentencesOf(text) {
  return text.split(/(?<=[.!?])\s+/).map((sentence) => sentence.trim()).filter(Boolean);
}

function confidenceFor(top) {
  if (!top.length || top[0].overlap < 2 || top[0].score < 0.28) return 'LOW';
  if (top[0].overlap >= 3 && top[0].score >= 0.45) return 'HIGH';
  return 'MEDIUM';
}

function answerFromEvidence(question, filters) {
  const evidence = searchEvidence(question, filters, 4);
  const confidence = confidenceFor(evidence);
  if (confidence === 'LOW') {
    return {
      answer: 'The approved documents do not contain enough evidence to answer that.',
      confidence,
      sources: [],
      followUpRequired: true,
      evidence
    };
  }
  const queryTokens = new Set(tokenize(question));
  const rankedSentences = evidence.flatMap((chunk) => sentencesOf(chunk.text).map((sentence) => ({
    sentence,
    chunk,
    overlap: new Set(tokenize(sentence).filter((token) => queryTokens.has(token))).size
  }))).sort((a, b) => b.overlap - a.overlap || b.chunk.score - a.chunk.score);
  const picked = rankedSentences.filter((item) => item.overlap > 0).slice(0, 2);
  const used = picked.length ? picked : rankedSentences.slice(0, 1);
  const sources = [];
  for (const item of used) {
    if (!sources.some((source) => source.document === item.chunk.document && source.section === item.chunk.section && source.version === item.chunk.version)) {
      sources.push({ document: item.chunk.document, section: item.chunk.section, version: item.chunk.version });
    }
  }
  return {
    answer: used.map((item) => item.sentence).join(' '),
    confidence,
    sources,
    followUpRequired: confidence !== 'HIGH',
    evidence
  };
}

function listDocuments() {
  return getDb().prepare(
    `SELECT d.id, d.name, d.format, d.version, d.effective_date, d.category, d.region, d.approval_status, d.created_at,
            COUNT(c.id) AS chunks
     FROM knowledge_documents d
     LEFT JOIN document_chunks c ON c.document_id = d.id
     GROUP BY d.id
     ORDER BY d.created_at DESC`
  ).all().map((row) => ({
    documentId: row.id,
    name: row.name,
    format: row.format,
    version: row.version,
    effectiveDate: row.effective_date,
    category: row.category,
    region: row.region,
    approvalStatus: row.approval_status,
    chunks: row.chunks,
    createdAt: row.created_at
  }));
}

module.exports = { searchEvidence, answerFromEvidence, listDocuments };
