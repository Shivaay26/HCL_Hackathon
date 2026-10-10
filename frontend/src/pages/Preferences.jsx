import { useEffect, useState } from 'react';
import { api } from '../api';

function flatten(nodes, depth = 0, acc = []) {
  for (const node of nodes) {
    acc.push({ id: node.id, name: `${'· '.repeat(depth)}${node.name}` });
    flatten(node.children || [], depth + 1, acc);
  }
  return acc;
}

export default function Preferences() {
  const [categories, setCategories] = useState([]);
  const [selected, setSelected] = useState([]);
  const [brands, setBrands] = useState('');
  const [budget, setBudget] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    api.categories().then(setCategories).catch((err) => setError(err.message));
    api.preferences().then((prefs) => {
      setSelected(prefs.categories || []);
      setBrands((prefs.brands || []).join(', '));
      setBudget(prefs.budget ?? '');
    }).catch((err) => setError(err.message));
  }, []);

  function toggle(id) {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  async function save(event) {
    event.preventDefault();
    try {
      await api.savePreferences({
        categories: selected,
        brands: brands.split(',').map((item) => item.trim()).filter(Boolean),
        budget: budget === '' ? null : Number(budget)
      });
      setNote('Preferences saved. Product suggestions will use them when your question leaves a detail out.');
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <form className="page panel form-grid" onSubmit={save}>
      <h1>Preferences</h1>
      {error && <p className="error">{error}</p>}
      {note && <p className="fine">{note}</p>}
      <fieldset>
        <legend>Preferred categories</legend>
        <div className="checks">
          {flatten(categories).map((category) => (
            <label key={category.id} className="check">
              <input type="checkbox" checked={selected.includes(category.id)} onChange={() => toggle(category.id)} />
              {category.name}
            </label>
          ))}
        </div>
      </fieldset>
      <label>Preferred brands<input value={brands} onChange={(event) => setBrands(event.target.value)} placeholder="Dell, Lenovo" /></label>
      <label>Budget<input type="number" min="0" value={budget} onChange={(event) => setBudget(event.target.value)} /></label>
      <button type="submit">Save preferences</button>
    </form>
  );
}
