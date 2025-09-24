const express = require('express');
const Task = require('../models/Task');
const auth = require('../middleware/auth');

const router = express.Router();

// Protect all routes below
router.use(auth);

// GET /api/tasks - list tasks for authenticated user
router.get('/', async (req, res) => {
  try {
    const tasks = await Task.find({ user: req.user.id }).sort({ created_at: -1 });
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
    const task = await Task.create({ user: req.user.id, title, description: description || '', status });
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
      { _id: id, user: req.user.id },
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
    const deleted = await Task.findOneAndDelete({ _id: id, user: req.user.id });
    if (!deleted) return res.status(404).json({ error: 'Task not found' });
    return res.status(204).send();
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;


