import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';

const demos = [
  ['basic@shopsmart.ai', 'Basic'],
  ['prime@shopsmart.ai', 'Prime'],
  ['premium@shopsmart.ai', 'Premium']
];

export default function Login() {
  const { customer, ready, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('prime@shopsmart.ai');
  const [password, setPassword] = useState('ShopSmart123');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!ready) return <div className="center-note">Loading ShopSmart…</div>;
  if (customer) return <Navigate to={location.state?.from || '/'} replace />;

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email, password);
      navigate(location.state?.from || '/');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-screen">
      <section className="login-copy">
        <p className="eyebrow">ShopSmart AI</p>
        <h1>Find the right product, then ask why it fits.</h1>
        <p>A shopping desk for catalog search, grounded policy answers, and simulated order tracking.</p>
      </section>
      <form className="panel login-panel" onSubmit={submit}>
        <h2>Sign in</h2>
        <label>Email<input value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" /></label>
        <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" /></label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Continue'}</button>
        <div className="demo-accounts">
          {demos.map(([value, tier]) => (
            <button key={value} type="button" className="ghost" onClick={() => setEmail(value)}>
              {tier}<span>{value}</span>
            </button>
          ))}
        </div>
        <p className="fine">Demo password for every account: ShopSmart123. Premium can upload policy documents.</p>
      </form>
    </div>
  );
}
