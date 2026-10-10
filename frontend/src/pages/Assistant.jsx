import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, money } from '../api';

const prompts = [
  ['Shopping', 'Suggest a laptop under $1000 for Java development and AI projects.'],
  ['Policy', 'Can I return an opened laptop?'],
  ['Order and policy', 'Where is my order, and can I cancel after shipment?']
];

export default function Assistant() {
  const [mode, setMode] = useState('chat');
  const [message, setMessage] = useState(prompts[0][1]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  async function ask(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (mode === 'recommend') setResult({ kind: 'recommend', data: await api.recommend(message) });
      else if (mode === 'knowledge') setResult({ kind: 'knowledge', data: await api.knowledge(message) });
      else setResult({ kind: 'chat', data: await api.chat(message) });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const data = result?.data;
  const recommendation = result?.kind === 'recommend' ? data : data?.recommendations;
  const knowledge = result?.kind === 'knowledge' ? data : data?.knowledge;

  return (
    <div className="page assistant">
      <div>
        <p className="eyebrow">One assistant</p>
        <h1>Ask about products, policies, or orders</h1>
        <div className="mode-row">
          {[['chat', 'Combined'], ['recommend', 'Products'], ['knowledge', 'Policies']].map(([id, label]) => (
            <button key={id} type="button" className={mode === id ? '' : 'ghost'} onClick={() => setMode(id)}>{label}</button>
          ))}
        </div>
        <div className="prompt-row">
          {prompts.map(([label, text]) => (
            <button key={label} type="button" className="ghost" onClick={() => setMessage(text)}>{label}</button>
          ))}
        </div>
        <form onSubmit={ask} className="ask">
          <textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={4} />
          <button type="submit" disabled={busy}>{busy ? 'Thinking…' : 'Ask'}</button>
        </form>
        {error && <p className="error">{error}</p>}
        {data?.warning && <p className="warning">{data.warning}</p>}
        {data?.answer && <article className="answer"><p>{data.answer}</p></article>}
        {recommendation?.interpretedRequirement && (
          <section className="panel">
            <h2>{recommendation.interpretedRequirement}</h2>
            <p className="fine">Budget {recommendation.budget == null ? 'not set' : money(recommendation.budget)}</p>
            {recommendation.clarifyingQuestion && <p>{recommendation.clarifyingQuestion}</p>}
            <div className="stack">
              {(recommendation.recommendations || []).map((item) => (
                <Link key={item.productId} to={`/product/${item.productId}`} className="order-card">
                  <div>
                    <strong>{item.productName}</strong>
                    <p>{item.reason}</p>
                  </div>
                  <span>{item.productId}</span>
                  <span className={`stock ${String(item.availability).toLowerCase()}`}>{item.availability}</span>
                </Link>
              ))}
            </div>
          </section>
        )}
        {knowledge && (
          <section className="panel">
            <p className={`confidence ${knowledge.confidence?.toLowerCase()}`}>{knowledge.confidence} confidence</p>
            <p>{knowledge.answer}</p>
            <ul className="plain-list">
              {(knowledge.sources || []).map((source) => (
                <li key={`${source.document}-${source.section}`}>{source.document} · {source.section} · v{source.version}</li>
              ))}
            </ul>
          </section>
        )}
      </div>
      <aside className="panel trace">
        <h2>Why this answer</h2>
        <p className="fine">Model {data?.model || '—'}. Tool calls and citations are stored in the audit log.</p>
        <ol className="plain-list">
          {(data?.tools || recommendation?.tools || knowledge?.tools || []).map((tool, index) => (
            <li key={`${tool.tool}-${index}`}><strong>{tool.tool}</strong><pre>{JSON.stringify(tool, null, 2)}</pre></li>
          ))}
        </ol>
        {!data && <p>Ask a question to see the tools the assistant used.</p>}
      </aside>
    </div>
  );
}
