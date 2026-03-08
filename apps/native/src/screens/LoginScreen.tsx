import { useState } from 'react';
import { supabase } from '../services/supabase';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleLogin() {
    if (!email || !password) return;
    setLoading(true);
    setError('');
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) setError(err.message);
    setLoading(false);
    // App.tsx lyssnar på onAuthStateChange och byter skärm automatiskt
  }

  return (
    <div className="screen center">
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem' }}>
            🚗
          </div>
          <h1>Korjournal</h1>
          <p className="sub">Logga in för att fortsätta</p>
        </div>

        <div className="field">
          <label>E-post</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="din@email.se"
            autoCapitalize="none"
            autoCorrect="off"
          />
        </div>

        <div className="field">
          <label>Lösenord</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
          />
        </div>

        {error && <p className="error">{error}</p>}

        <button
          className="btn blue large"
          onClick={handleLogin}
          disabled={loading || !email || !password}
        >
          {loading ? 'Loggar in...' : 'Logga in'}
        </button>
      </div>
    </div>
  );
}
