const express = require('express');
const Task = require('../models/Task');
const auth = require('../middleware/auth');

const router = express.Router();

// Protect all routes below
router.use(auth);

// GET /api/tasks - list tasks for authenticated user
router.get('/', async (req, res) => {
  try {
    const tasks = await Task.find({ user: req.user.id, isCommunity: { $ne: true } }).sort({ created_at: -1 });
    return res.status(200).json(tasks);
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/tasks - create task
router.post('/', async (req, res) => {
  try {
    const { title, description, status } = req.body || {};
    if (!title) return res.status(400).json({ error: 'title is required' });
    const task = await Task.create({ user: req.user.id, title, description: description || '', status, isCommunity: false });
    return res.status(201).json(task);
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/tasks/:id - update task (scoped)
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, status } = req.body || {};
    const task = await Task.findOneAndUpdate(
      { _id: id, user: req.user.id, isCommunity: { $ne: true } },
      { $set: { ...(title !== undefined ? { title } : {}), ...(description !== undefined ? { description } : {}), ...(status !== undefined ? { status } : {}) } },
      { new: true }
    );
    if (!task) return res.status(404).json({ error: 'Task not found' });
    return res.status(200).json(task);
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/tasks/:id - delete task (scoped)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Task.findOneAndDelete({ _id: id, user: req.user.id, isCommunity: { $ne: true } });
    if (!deleted) return res.status(404).json({ error: 'Task not found' });
    return res.status(204).send();
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Community Routes
// GET /api/tasks/community - list all community tasks
router.get('/community', async (_req, res) => {
  try {
    const tasks = await Task.find({ isCommunity: true }).populate('user', 'fullName email').sort({ created_at: -1 });
    return res.status(200).json(tasks);
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/tasks/community - create community task
router.post('/community', async (req, res) => {
  try {
    const { title, description, status } = req.body || {};
    if (!title) return res.status(400).json({ error: 'title is required' });
    const task = await Task.create({ user: req.user.id, title, description: description || '', status, isCommunity: true });

    const io = req.app.get('io');
    io.to('community').emit('community:task:created', { task, user: req.user });
    return res.status(201).json(task);
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/tasks/community/:id - update community task (owner only)
router.put('/community/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, status } = req.body || {};
    const task = await Task.findOne({ _id: id, isCommunity: true });
    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (String(task.user) !== String(req.user.id)) return res.status(403).json({ error: 'Forbidden' });
    task.title = title !== undefined ? title : task.title;
    task.description = description !== undefined ? description : task.description;
    task.status = status !== undefined ? status : task.status;
    await task.save();

    const io = req.app.get('io');
    io.to('community').emit('community:task:updated', { task, user: req.user });
    return res.status(200).json(task);
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/tasks/community/:id - delete community task (owner only)
router.delete('/community/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const task = await Task.findOne({ _id: id, isCommunity: true });
    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (String(task.user) !== String(req.user.id)) return res.status(403).json({ error: 'Forbidden' });
    await task.deleteOne();

    const io = req.app.get('io');
    io.to('community').emit('community:task:deleted', { id, user: req.user });
    return res.status(204).send();
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// COMMENTS
// GET /api/tasks/community/:id/comments - list comments
router.get('/community/:id/comments', async (req, res) => {
  try {
    const { id } = req.params;
    const task = await Task.findOne({ _id: id, isCommunity: true }).populate('comments.user', 'fullName email');
    if (!task) return res.status(404).json({ error: 'Task not found' });
    return res.status(200).json(task.comments || []);
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/tasks/community/:id/comments - add comment
router.post('/community/:id/comments', async (req, res) => {
  try {
    const { id } = req.params;
    const { text } = req.body || {};
    if (!text) return res.status(400).json({ error: 'text is required' });
    const task = await Task.findOne({ _id: id, isCommunity: true });
    if (!task) return res.status(404).json({ error: 'Task not found' });
    const comment = { user: req.user.id, text, created_at: new Date() };
    task.comments.unshift(comment);
    await task.save();

    const populated = await Task.findById(task._id).populate('comments.user', 'fullName email');
    const newComment = populated.comments[0];

    const io = req.app.get('io');
    io.to('community').emit('community:comment:created', { taskId: String(task._id), comment: newComment, user: req.user });
    return res.status(201).json(newComment);
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// REACTIONS
// POST /api/tasks/community/:id/reactions - add reaction { emoji }
router.post('/community/:id/reactions', async (req, res) => {
  try {
    const { id } = req.params;
    const { emoji } = req.body || {};
    if (!emoji) return res.status(400).json({ error: 'emoji is required' });
    const task = await Task.findOne({ _id: id, isCommunity: true });
    if (!task) return res.status(404).json({ error: 'Task not found' });
    // prevent duplicate same reaction by same user
    if (!task.reactions.find((r) => String(r.user) === String(req.user.id) && r.emoji === emoji)) {
      task.reactions.push({ user: req.user.id, emoji });
      await task.save();
    }
    const io = req.app.get('io');
    io.to('community').emit('community:reaction:added', { taskId: String(task._id), emoji, user: req.user });
    return res.status(201).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/tasks/community/:id/reactions - remove reaction { emoji }
router.delete('/community/:id/reactions', async (req, res) => {
  try {
    const { id } = req.params;
    const { emoji } = req.body || {};
    if (!emoji) return res.status(400).json({ error: 'emoji is required' });
    const task = await Task.findOne({ _id: id, isCommunity: true });
    if (!task) return res.status(404).json({ error: 'Task not found' });
    const before = task.reactions.length;
    task.reactions = task.reactions.filter((r) => !(String(r.user) === String(req.user.id) && r.emoji === emoji));
    if (task.reactions.length !== before) await task.save();
    const io = req.app.get('io');
    io.to('community').emit('community:reaction:removed', { taskId: String(task._id), emoji, user: req.user });
    return res.status(204).send();
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;


