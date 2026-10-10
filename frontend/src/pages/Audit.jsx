import { useEffect, useState } from 'react';
import { api, when } from '../api';

export default function Audit() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => { api.audit().then((data) => setItems(data.items)).catch((err) => setError(err.message)); }, []);
  return (
    <div className="page">
      <h1>Audit</h1>
      <p className="fine">Each assistant request stores the question, model, tools, sources, outcome, and time.</p>
      {error && <p className="error">{error}</p>}
      {items.length === 0 && <p>No assistant requests yet.</p>}
      <div className="stack">
        {items.map((item) => (
          <details key={item.id} className="panel">
            <summary>{item.endpoint} · {item.outcome} · {when(item.timestamp)}</summary>
            <p className="fine">Model {item.modelName}</p>
            <h3>Request</h3>
            <pre>{JSON.stringify(item.request, null, 2)}</pre>
            <h3>Tools</h3>
            <pre>{JSON.stringify(item.toolActivity, null, 2)}</pre>
            <h3>Sources</h3>
            <pre>{JSON.stringify(item.sourceReferences, null, 2)}</pre>
          </details>
        ))}
      </div>
    </div>
  );
}
