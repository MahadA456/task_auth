import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api'
import { useAuth } from '../contexts/useAuth'
import { useToast } from '../hooks/useToast'
import { createCommunitySocket } from '../lib/socket'

export default function Community() {
  const { user } = useAuth()
  const { notify } = useToast()
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ title: '', description: '', status: 'Pending' })
  const [saving, setSaving] = useState(false)
  const [presence, setPresence] = useState([])
  const [statusFilter, setStatusFilter] = useState('All')
  const [userFilter, setUserFilter] = useState('All')
  const socketRef = useRef(null)
  const [openComments, setOpenComments] = useState({}) // taskId -> boolean
  const [commentsByTask, setCommentsByTask] = useState({}) // taskId -> comments[]
  const [commentDrafts, setCommentDrafts] = useState({}) // taskId -> text
  const [editingByTask, setEditingByTask] = useState({}) // taskId -> { [userId]: user }

  useEffect(() => {
    let active = true
    const load = async () => {
      setError('')
      setLoading(true)
      try {
        const data = await api.getCommunityTasks()
        if (!active) return
        setTasks(data)
      } catch (e) {
        setError(e?.data?.error || 'Failed to load tasks')
      } finally {
        setLoading(false)
      }
    }
    load()

    const { socket, leave, disconnect } = createCommunitySocket(user)
    socketRef.current = socket
    socket.on('community:presence', (users) => setPresence(users || []))
    socket.on('community:notice', (evt) => {
      if (evt?.type === 'join') notify(`${evt.user.fullName || evt.user.email || 'Someone'} joined the board`, 'info')
      if (evt?.type === 'leave') notify(`${evt.user?.fullName || evt.user?.email || 'Someone'} left the board`, 'info')
    })
    socket.on('community:task:created', ({ task, user: actor }) => {
      setTasks((ts) => [task, ...ts])
      if (actor?.id !== user?.id) notify(`${actor?.fullName || actor?.email || 'Someone'} added a new task`, 'info')
    })
    socket.on('community:task:updated', ({ task }) => {
      setTasks((ts) => ts.map((t) => (t._id === task._id ? task : t)))
    })
    socket.on('community:task:deleted', ({ id, user: actor }) => {
      setTasks((ts) => ts.filter((t) => t._id !== id))
      if (actor?.id !== user?.id) notify(`${actor?.fullName || actor?.email || 'Someone'} deleted a task`, 'info')
    })
    socket.on('community:comment:created', ({ taskId, comment }) => {
      setCommentsByTask((map) => ({ ...map, [taskId]: [comment, ...(map[taskId] || [])] }))
    })
    socket.on('community:reaction:added', ({ taskId, emoji, user: actor }) => {
      setTasks((ts) => ts.map((t) => {
        if (t._id !== taskId) return t
        const reactions = Array.isArray(t.reactions) ? [...t.reactions] : []
        reactions.push({ user: actor?.id, emoji })
        return { ...t, reactions }
      }))
    })
    socket.on('community:reaction:removed', ({ taskId, emoji, user: actor }) => {
      setTasks((ts) => ts.map((t) => {
        if (t._id !== taskId) return t
        const reactions = (t.reactions || []).filter((r) => !(String(r.user) === String(actor?.id) && r.emoji === emoji))
        return { ...t, reactions }
      }))
    })
    socket.on('community:editing', ({ taskId, user: actor, editing }) => {
      if (!actor?.id || actor.id === user?.id) return
      setEditingByTask((state) => {
        const current = { ...(state[taskId] || {}) }
        if (editing) current[actor.id] = actor
        else delete current[actor.id]
        return { ...state, [taskId]: current }
      })
    })

    return () => {
      leave()
      disconnect()
      active = false
    }
  }, [user, notify])

  const canEdit = (task) => String(task.user?._id || task.user) === String(user?.id)

  const create = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const t = await api.createCommunityTask(form)
      setForm({ title: '', description: '', status: 'Pending' })
    } catch (e) {
      setError(e?.data?.error || 'Failed to create task')
      notify(e?.data?.error || 'Failed to create task', 'error')
    } finally {
      setSaving(false)
    }
  }

  const update = async (id, patch) => {
    try {
      await api.updateCommunityTask(id, patch)
    } catch (e) {
      setError(e?.data?.error || 'Failed to update task')
      notify(e?.data?.error || 'Failed to update task', 'error')
    }
  }

  const remove = async (id) => {
    try {
      await api.deleteCommunityTask(id)
    } catch (e) {
      setError(e?.data?.error || 'Failed to delete task')
      notify(e?.data?.error || 'Failed to delete task', 'error')
    }
  }

  const creators = useMemo(() => {
    const set = new Map()
    for (const t of tasks) {
      const key = t.user?.fullName || t.user?.email || String(t.user)
      if (key) set.set(key, key)
    }
    return ['All', ...Array.from(set.keys())]
  }, [tasks])

  const filtered = useMemo(() => {
    let list = [...tasks]
    if (statusFilter !== 'All') list = list.filter((t) => t.status === statusFilter)
    if (userFilter !== 'All') list = list.filter((t) => (t.user?.fullName || t.user?.email || String(t.user)) === userFilter)
    return list
  }, [tasks, statusFilter, userFilter])

  const getReactionSummary = (t) => {
    const counts = {}
    for (const r of t.reactions || []) counts[r.emoji] = (counts[r.emoji] || 0) + 1
    return counts
  }

  const hasReacted = (t, emoji) => (t.reactions || []).some((r) => String(r.user) === String(user?.id) && r.emoji === emoji)

  const toggleReaction = async (t, emoji) => {
    try {
      if (hasReacted(t, emoji)) await api.removeReaction(t._id, emoji)
      else await api.addReaction(t._id, emoji)
    } catch (e) {
      notify(e?.data?.error || 'Failed to react', 'error')
    }
  }

  const loadComments = async (taskId) => {
    try {
      const list = await api.getComments(taskId)
      setCommentsByTask((map) => ({ ...map, [taskId]: list }))
    } catch (e) {
      notify(e?.data?.error || 'Failed to load comments', 'error')
    }
  }

  const submitComment = async (taskId) => {
    const text = (commentDrafts[taskId] || '').trim()
    if (!text) return
    try {
      await api.addComment(taskId, { text })
      setCommentDrafts((m) => ({ ...m, [taskId]: '' }))
    } catch (e) {
      notify(e?.data?.error || 'Failed to add comment', 'error')
    }
  }

  const startEditing = (taskId) => {
    socketRef.current?.emit('community:editing:start', { taskId, user })
  }
  const stopEditing = (taskId) => {
    socketRef.current?.emit('community:editing:stop', { taskId, user })
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-slate-900">Community Tasks</h2>
          <div className="text-sm text-slate-600">Active: {presence.length}</div>
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
              <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value) }} className="rounded-md border border-slate-300 px-2 py-1">
                <option>All</option>
                <option>Pending</option>
                <option>In Progress</option>
                <option>Completed</option>
              </select>
            </label>
            <label className="text-sm text-slate-600 flex items-center gap-2">
              <span>User</span>
              <select value={userFilter} onChange={(e) => setUserFilter(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1">
                {creators.map((u) => <option key={u}>{u}</option>)}
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
              {filtered.map((t) => (
                <div key={t._id} className="rounded-md border border-slate-200 bg-white p-3 grid grid-cols-1 md:grid-cols-12 gap-2 items-start">
                  <div className="md:col-span-6">
                    <div className="font-semibold text-slate-900">{t.title}</div>
                    {t.description && <div className="text-sm text-slate-600">{t.description}</div>}
                    <div className="text-xs text-slate-500 mt-1">{t.user?.fullName || t.user?.email || 'Unknown'} • {new Date(t.created_at || t.createdAt || 0).toLocaleString()}</div>
                    {Object.keys(editingByTask[t._id] || {}).length > 0 && (
                      <div className="text-xs text-amber-700 mt-1">Someone is editing…</div>
                    )}
                  </div>
                  <select value={t.status} onChange={(e) => update(t._id, { status: e.target.value })} onFocus={() => startEditing(t._id)} onBlur={() => stopEditing(t._id)} disabled={!canEdit(t)} className="md:col-span-3 rounded-md border border-slate-300 px-3 py-2 disabled:opacity-60">
                    <option>Pending</option>
                    <option>In Progress</option>
                    <option>Completed</option>
                  </select>
                  <div className="md:col-span-3 flex items-center justify-end gap-2">
                    {canEdit(t) && (
                      <button onClick={() => remove(t._id)} className="rounded-md bg-rose-600 px-3 py-2 text-white hover:bg-rose-700">Delete</button>
                    )}
                  </div>
                  <div className="md:col-span-12 mt-2">
                    <div className="flex items-center gap-2 text-sm">
                      {['👍','🎉','❤️','🔥'].map((emo) => {
                        const counts = getReactionSummary(t)
                        const active = hasReacted(t, emo)
                        return (
                          <button key={emo} onClick={() => toggleReaction(t, emo)} className={`rounded-full border px-2 py-1 ${active ? 'bg-slate-900 text-white' : 'bg-white'}`}>
                            {emo} {counts[emo] ? counts[emo] : ''}
                          </button>
                        )
                      })}
                      <button onClick={() => {
                        const open = !!openComments[t._id]
                        const next = { ...openComments, [t._id]: !open }
                        setOpenComments(next)
                        if (!open && !commentsByTask[t._id]) loadComments(t._id)
                      }} className="ml-2 text-slate-700 underline">{openComments[t._id] ? 'Hide' : 'Comments'}</button>
                    </div>
                    {openComments[t._id] && (
                      <div className="mt-2">
                        <div className="grid gap-2">
                          {(commentsByTask[t._id] || []).map((c, idx) => (
                            <div key={idx} className="text-sm">
                              <span className="font-medium">{c.user?.fullName || c.user?.email || 'User'}:</span> {c.text}
                              <span className="text-xs text-slate-500 ml-2">{new Date(c.created_at || 0).toLocaleString()}</span>
                            </div>
                          ))}
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <input value={commentDrafts[t._id] || ''} onFocus={() => startEditing(t._id)} onBlur={() => stopEditing(t._id)} onChange={(e) => setCommentDrafts((m) => ({ ...m, [t._id]: e.target.value }))} placeholder="Write a comment…" className="flex-1 rounded-md border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-900" />
                          <button onClick={() => submitComment(t._id)} className="rounded-md bg-slate-900 px-3 py-2 text-white hover:bg-slate-800">Send</button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}


