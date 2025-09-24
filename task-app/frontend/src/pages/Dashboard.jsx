import { useEffect, useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../contexts/useAuth';
import { useToast } from '../hooks/useToast';

export default function Dashboard() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ title: '', description: '', status: 'Pending' });
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState('All');
  const [sortBy, setSortBy] = useState('created');
  const [page, setPage] = useState(1);
  const pageSize = 5;
  const { notify } = useToast();

  useEffect(() => {
    if (!user) return nav('/login');
    const load = async () => {
      setError('');
      setLoading(true);
      try {
        const data = await api.getTasks();
        setTasks(data);
      } catch (e) {
        setError(e?.data?.error || 'Failed to load tasks');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user, nav]);

  const create = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const t = await api.createTask(form);
      setTasks([t, ...tasks]);
      setForm({ title: '', description: '', status: 'Pending' });
      notify('Task added', 'success');
    } catch (e) {
      setError(e?.data?.error || 'Failed to create task');
      notify(e?.data?.error || 'Failed to create task', 'error');
    } finally {
      setSaving(false);
    }
  };

  const update = async (id, patch) => {
    try {
      const t = await api.updateTask(id, patch);
      setTasks(tasks.map((x) => (x._id === id ? t : x)));
      notify('Task updated', 'success');
    } catch (e) {
      setError(e?.data?.error || 'Failed to update task');
      notify(e?.data?.error || 'Failed to update task', 'error');
    }
  };

  const remove = async (id) => {
    try {
      await api.deleteTask(id);
      setTasks(tasks.filter((x) => x._id !== id));
      notify('Task deleted', 'success');
    } catch (e) {
      setError(e?.data?.error || 'Failed to delete task');
      notify(e?.data?.error || 'Failed to delete task', 'error');
    }
  };

  const toggleCompleted = async (task) => {
    const newStatus = task.status === 'Completed' ? 'Pending' : 'Completed';
    await update(task._id, { status: newStatus });
  };

  const filtered = useMemo(() => {
    let list = [...tasks]
    if (statusFilter !== 'All') list = list.filter((t) => t.status === statusFilter)
    if (sortBy === 'title') list.sort((a, b) => a.title.localeCompare(b.title))
    if (sortBy === 'status') list.sort((a, b) => a.status.localeCompare(b.status))
    if (sortBy === 'created') list.sort((a, b) => (new Date(b.createdAt || 0)) - (new Date(a.createdAt || 0)))
    return list
  }, [tasks, statusFilter, sortBy])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const paged = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-slate-900">Dashboard {user ? `— Welcome, ${user.fullName}` : ''}</h2>
          <div className="flex items-center gap-2">
            <Link to="/community" className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100">Community</Link>
            <button onClick={logout} className="rounded-md bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-800">Logout</button>
          </div>
        </div>
        {error && <div className="mt-3 rounded-md bg-rose-600 text-white px-3 py-2 text-sm">{error}</div>}

        <form onSubmit={create} className="mt-4 grid grid-cols-1 md:grid-cols-12 gap-2">
          <input placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required className="md:col-span-4 rounded-md border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-900" />
          <input placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="md:col-span-4 rounded-md border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-900" />
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="md:col-span-2 rounded-md border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-900">
            <option>Pending</option>
            <option>In Progress</option>
            <option>Completed</option>
          </select>
          <button disabled={saving} type="submit" className="md:col-span-2 rounded-md bg-slate-900 px-4 py-2 text-white hover:bg-slate-800 disabled:opacity-60">{saving ? 'Adding...' : 'Add Task'}</button>
        </form>

        <div className="mt-4 flex flex-col md:flex-row gap-2 md:items-center md:justify-between">
          <div className="flex gap-2">
            <label className="text-sm text-slate-600 flex items-center gap-2">
              <span>Status</span>
              <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="rounded-md border border-slate-300 px-2 py-1">
                <option>All</option>
                <option>Pending</option>
                <option>In Progress</option>
                <option>Completed</option>
              </select>
            </label>
            <label className="text-sm text-slate-600 flex items-center gap-2">
              <span>Sort</span>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1">
                <option value="created">Newest</option>
                <option value="title">Title</option>
                <option value="status">Status</option>
              </select>
            </label>
          </div>
          <div className="text-sm text-slate-600">{filtered.length} tasks</div>
        </div>

        <div className="mt-3">
          {loading ? (
            <div className="text-slate-600">Loading tasks...</div>
          ) : filtered.length === 0 ? (
            <div className="text-slate-600">No tasks found.</div>
          ) : (
            <div className="grid gap-2">
              {paged.map((t) => (
                <div key={t._id} className="rounded-md border border-slate-200 bg-white p-3 grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
                  <label className="md:col-span-6 flex items-start gap-3">
                    <input type="checkbox" className="mt-1 size-4" checked={t.status === 'Completed'} onChange={() => toggleCompleted(t)} />
                    <div>
                      <div className="font-semibold text-slate-900">{t.title}</div>
                      {t.description && <div className="text-sm text-slate-600">{t.description}</div>}
                    </div>
                  </label>
                  <select value={t.status} onChange={(e) => update(t._id, { status: e.target.value })} className="md:col-span-3 rounded-md border border-slate-300 px-3 py-2">
                    <option>Pending</option>
                    <option>In Progress</option>
                    <option>Completed</option>
                  </select>
                  <div className="md:col-span-3 flex items-center justify-end gap-2">
                    <button onClick={() => remove(t._id)} className="rounded-md bg-rose-600 px-3 py-2 text-white hover:bg-rose-700">Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {filtered.length > pageSize && (
          <div className="mt-3 flex items-center justify-center gap-2">
            <button disabled={currentPage === 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="rounded-md border border-slate-300 px-3 py-1 disabled:opacity-50">Prev</button>
            <div className="text-sm text-slate-700">Page {currentPage} of {totalPages}</div>
            <button disabled={currentPage === totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="rounded-md border border-slate-300 px-3 py-1 disabled:opacity-50">Next</button>
          </div>
        )}
      </div>
    </div>
  );
}


