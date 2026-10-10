import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';

export default function Knowledge() {
  const { customer } = useAuth();
  const [docs, setDocs] = useState([]);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [form, setForm] = useState({ name: '', version: '2026.1', effectiveDate: '2026-04-01', category: 'RETURNS', region: 'GLOBAL' });

  function load() {
    api.documents().then((data) => setDocs(data.items)).catch((err) => setError(err.message));
  }
  useEffect(load, []);

  async function upload(event) {
    event.preventDefault();
    const file = event.target.file.files[0];
    if (!file) return setError('Choose a file.');
    const body = new FormData();
    Object.entries(form).forEach(([key, value]) => body.append(key, value));
    body.append('file', file);
    setError('');
    try {
      const result = await api.uploadDocument(body);
      setNote(`Ingested ${result.documentId} with ${result.chunks} chunks.`);
      event.target.reset();
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="page">
      <p className="eyebrow">Approved knowledge</p>
      <h1>Policy library</h1>
      <p className="fine">Answers use only these documents. Upload is limited to the demo uploader.</p>
      {error && <p className="error">{error}</p>}
      {note && <p className="fine">{note}</p>}
      {customer.canUploadDocuments && (
        <form className="panel form-grid" onSubmit={upload}>
          <h2>Upload</h2>
          <label>Name<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Laptop Return Policy" /></label>
          <label>Version<input value={form.version} onChange={(event) => setForm({ ...form, version: event.target.value })} required /></label>
          <label>Effective date<input value={form.effectiveDate} onChange={(event) => setForm({ ...form, effectiveDate: event.target.value })} required /></label>
          <label>Category<input value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} required /></label>
          <label>Region<input value={form.region} onChange={(event) => setForm({ ...form, region: event.target.value })} required /></label>
          <label>File<input name="file" type="file" accept=".pdf,.md,.markdown,.json" required /></label>
          <button type="submit">Ingest document</button>
          <p className="fine">Try backend/samples/warranty-excerpt.json. A sample PDF, Markdown, or JSON file works.</p>
        </form>
      )}
      <div className="table-wrap">
        <table>
          <thead><tr><th>Document</th><th>Format</th><th>Version</th><th>Category</th><th>Region</th><th>Chunks</th></tr></thead>
          <tbody>
            {docs.map((doc) => (
              <tr key={doc.documentId}>
                <td>{doc.name}</td><td>{doc.format}</td><td>{doc.version}</td><td>{doc.category}</td><td>{doc.region}</td><td>{doc.chunks}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
