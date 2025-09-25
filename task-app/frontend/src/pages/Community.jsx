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
  const [typingByTask, setTypingByTask] = useState({}) // taskId -> { [userId]: user }
  const typingTimeouts = useRef({}) // taskId -> timeoutId
  const [showReactionDetails, setShowReactionDetails] = useState({}) // taskId -> boolean

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
    socket.on('community:reaction:added', ({ taskId, emoji, user: actor, reaction, updatedTask }) => {
      setTasks((ts) => ts.map((t) => {
        if (t._id !== taskId) return t
        // Use the updated task data if available, otherwise fallback to manual update
        if (updatedTask) {
          return updatedTask
        }
        const reactions = Array.isArray(t.reactions) ? [...t.reactions] : []
        // Only add if this reaction doesn't already exist for this user
        const existingReaction = reactions.find(r => String(r.user) === String(actor?.id) && r.emoji === emoji)
        if (!existingReaction) {
          reactions.push(reaction || { user: actor?.id, emoji })
        }
        return { ...t, reactions }
      }))
    })
    socket.on('community:reaction:removed', ({ taskId, emoji, user: actor, updatedTask }) => {
      setTasks((ts) => ts.map((t) => {
        if (t._id !== taskId) return t
        // Use the updated task data if available, otherwise fallback to manual update
        if (updatedTask) {
          return updatedTask
        }
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
    socket.on('community:comment:typing', ({ taskId, user: actor, typing }) => {
      if (!actor?.id || actor.id === user?.id) return
      setTypingByTask((state) => {
        const current = { ...(state[taskId] || {}) }
        if (typing) current[actor.id] = actor
        else delete current[actor.id]
        return { ...state, [taskId]: current }
      })
    })

    return () => {
      leave()
      disconnect()
      active = false
      
      // Clear all typing timeouts
      Object.values(typingTimeouts.current).forEach(timeoutId => {
        clearTimeout(timeoutId)
      })
      typingTimeouts.current = {}
    }
  }, [user, notify])

  const canEdit = (task) => String(task.user?._id || task.user) === String(user?.id)

  const create = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      await api.createCommunityTask(form)
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
    const usersByEmoji = {}
    for (const r of t.reactions || []) {
      counts[r.emoji] = (counts[r.emoji] || 0) + 1
      if (!usersByEmoji[r.emoji]) usersByEmoji[r.emoji] = []
      usersByEmoji[r.emoji].push(r.user)
    }
    return { counts, usersByEmoji }
  }

  const hasReacted = (t, emoji) => {
    if (!user || !t.reactions) return false
    
    console.log(`hasReacted debug:`, {
      user: user,
      reactions: t.reactions,
      emoji
    })
    
    const reacted = t.reactions.some((r) => {
      const reactionUserId = r.user?._id || r.user
      const currentUserId = user._id || user.id
      const isMatch = String(reactionUserId) === String(currentUserId) && r.emoji === emoji
      
      console.log(`Reaction check:`, {
        reactionUserId,
        currentUserId,
        emoji: r.emoji,
        targetEmoji: emoji,
        isMatch
      })
      
      return isMatch
    })
    
    console.log(`hasReacted result:`, { 
      taskId: t._id, 
      emoji, 
      userId: user?.id, 
      reacted 
    })
    
    return reacted
  }

  const toggleReaction = async (t, emoji) => {
    try {
      const hasReactedToThis = hasReacted(t, emoji)
      console.log(`Toggle reaction: ${emoji} on task ${t._id}, hasReacted: ${hasReactedToThis}`)
      
      if (hasReactedToThis) {
        console.log('Removing reaction...')
        await api.removeReaction(t._id, emoji)
        notify('Reaction removed', 'success')
      } else {
        console.log('Adding reaction...')
        await api.addReaction(t._id, emoji)
        notify('Reaction added', 'success')
      }
    } catch (e) {
      console.error('Reaction toggle error:', e)
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

  const startCommentTyping = (taskId) => {
    socketRef.current?.emit('community:comment:typing:start', { taskId, user })
    
    // Clear existing timeout
    if (typingTimeouts.current[taskId]) {
      clearTimeout(typingTimeouts.current[taskId])
    }
    
    // Set new timeout to stop typing after 3 seconds of inactivity
    typingTimeouts.current[taskId] = setTimeout(() => {
      stopCommentTyping(taskId)
    }, 3000)
  }
  const stopCommentTyping = (taskId) => {
    socketRef.current?.emit('community:comment:typing:stop', { taskId, user })
    
    // Clear timeout
    if (typingTimeouts.current[taskId]) {
      clearTimeout(typingTimeouts.current[taskId])
      delete typingTimeouts.current[taskId]
    }
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
                        const { counts, usersByEmoji } = getReactionSummary(t)
                        const active = hasReacted(t, emo)
                        const count = counts[emo] || 0
                        const users = usersByEmoji[emo] || []
                        
                        // Debug logging
                        if (active) {
                          console.log(`User has reacted to ${emo} on task ${t._id}`)
                        }
                        return (
                          <div key={emo} className="relative group">
                            <button 
                              onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                console.log(`Button clicked for ${emo}, active: ${active}`)
                                toggleReaction(t, emo)
                              }} 
                              className={`rounded-full border-2 px-3 py-1 font-medium transition-all duration-200 cursor-pointer ${
                                active 
                                  ? 'bg-black text-white border-black hover:bg-gray-800 hover:scale-105' 
                                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                              }`}
                              title={active ? `Click to remove your ${emo} reaction` : `Click to add ${emo} reaction`}
                            >
                              {emo} {count > 0 ? count : ''}
                            </button>
                            {count > 0 && (
                              <div className="absolute bottom-full left-0 mb-1 hidden group-hover:block bg-slate-800 text-white text-xs rounded px-2 py-1 whitespace-nowrap z-10 min-w-max">
                                <div className="font-medium mb-1">{emo} Reactions:</div>
                                {users.map((userData, idx) => {
                                  const isCurrentUser = String(userData?._id || userData) === String(user?.id)
                                  const userName = userData?.fullName || userData?.email || 'User'
                                  return (
                                    <div key={idx} className="flex items-center gap-2">
                                      <span className={isCurrentUser ? 'font-medium' : ''}>
                                        {isCurrentUser ? 'You' : userName}
                                      </span>
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )
                      })}
                      <button onClick={() => {
                        const open = !!openComments[t._id]
                        const next = { ...openComments, [t._id]: !open }
                        setOpenComments(next)
                        if (!open && !commentsByTask[t._id]) loadComments(t._id)
                      }} className="ml-2 text-slate-700 underline">{openComments[t._id] ? 'Hide' : 'Comments'}</button>
                      <button onClick={() => {
                        const show = !!showReactionDetails[t._id]
                        setShowReactionDetails(prev => ({ ...prev, [t._id]: !show }))
                      }} className="ml-2 text-slate-700 underline">
                        {showReactionDetails[t._id] ? 'Hide Reactions' : 'Show Reactions'}
                      </button>
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
                          <input 
                            value={commentDrafts[t._id] || ''} 
                            onFocus={() => {
                              startEditing(t._id)
                              startCommentTyping(t._id)
                            }} 
                            onBlur={() => {
                              stopEditing(t._id)
                              stopCommentTyping(t._id)
                            }} 
                            onChange={(e) => {
                              setCommentDrafts((m) => ({ ...m, [t._id]: e.target.value }))
                              // Start typing indicator and reset timeout on each keystroke
                              startCommentTyping(t._id)
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault()
                                submitComment(t._id)
                                stopCommentTyping(t._id)
                              }
                            }}
                            placeholder="Write a comment…" 
                            className="flex-1 rounded-md border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-900" 
                          />
                          <button 
                            onClick={() => {
                              submitComment(t._id)
                              stopCommentTyping(t._id)
                            }} 
                            className="rounded-md bg-slate-900 px-3 py-2 text-white hover:bg-slate-800"
                          >
                            Send
                          </button>
                        </div>
                        {Object.values(typingByTask[t._id] || {}).filter(typingUser => String(typingUser._id || typingUser.id) !== String(user?.id)).length > 0 && (
                          <div className="mt-1 text-xs text-slate-500">
                            {Object.values(typingByTask[t._id] || {})
                              .filter(typingUser => String(typingUser._id || typingUser.id) !== String(user?.id))
                              .map((typingUser, idx, filteredUsers) => (
                                <span key={idx}>
                                  {typingUser.fullName || typingUser.email || 'Someone'} is typing...
                                  {idx < filteredUsers.length - 1 ? ', ' : ''}
                                </span>
                              ))}
                          </div>
                        )}
                      </div>
                    )}
                    {showReactionDetails[t._id] && (
                      <div className="mt-2 p-3 bg-slate-50 rounded-md">
                        <div className="text-sm font-medium text-slate-700 mb-2">All Reactions:</div>
                        <div className="grid gap-2">
                          {['👍','🎉','❤️','🔥'].map((emo) => {
                            const { counts, usersByEmoji } = getReactionSummary(t)
                            const count = counts[emo] || 0
                            const users = usersByEmoji[emo] || []
                            if (count === 0) return null
                            
                            return (
                              <div key={emo} className="flex items-center gap-2">
                                <span className="text-lg">{emo}</span>
                                <span className="text-sm text-slate-600">({count})</span>
                                <div className="flex flex-wrap gap-1">
                                  {users.map((userData, idx) => {
                                    const isCurrentUser = String(userData?._id || userData) === String(user?.id)
                                    const userName = userData?.fullName || userData?.email || 'User'
                                    return (
                                      <div key={idx} className={`flex items-center gap-1 px-2 py-1 rounded-full border text-xs ${
                                        isCurrentUser 
                                          ? 'bg-slate-200 border-slate-300 font-medium text-slate-900' 
                                          : 'bg-white border-slate-200 text-slate-600'
                                      }`}>
                                        <span>
                                          {isCurrentUser ? 'You' : userName}
                                        </span>
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                            )
                          })}
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


