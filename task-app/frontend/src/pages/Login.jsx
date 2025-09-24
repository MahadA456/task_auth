import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/useAuth';
import { useToast } from '../hooks/useToast';

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const { notify } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      notify('Welcome back!', 'success');
      nav('/');
    } catch (err) {
      setError(err?.data?.error || 'Login failed');
      notify(err?.data?.error || 'Login failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center bg-slate-50 px-4">
      <div className="absolute top-10 inset-x-0 text-center">
        <h1 className="text-3xl font-extrabold text-slate-900">Task Management Dashboard</h1>
      </div>
      <div className="w-full max-w-md">
        <h2 className="text-xl font-semibold text-slate-900 text-center">Login</h2>
        {error && <div className="mt-3 rounded-md bg-rose-600 text-white px-3 py-2 text-sm">{error}</div>}
        <form onSubmit={onSubmit} className="mt-5 grid gap-3">
          <label className="grid gap-1 text-sm">
            <span className="text-slate-700">Email</span>
            <input className="w-full rounded-md border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-900" value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-slate-700">Password</span>
            <input className="w-full rounded-md border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-900" value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />
          </label>
          <button disabled={loading} type="submit" className="mt-2 inline-flex items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-white hover:bg-slate-800 disabled:opacity-60">{loading ? 'Signing in...' : 'Login'}</button>
        </form>
        <p className="mt-3 text-sm text-slate-600">No account? <Link to="/signup" className="text-slate-900 font-medium">Sign up</Link></p>
      </div>
    </div>
  );
}


