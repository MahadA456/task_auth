
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const axios = require('axios');

const authRoutes = require('./routes/auth');
const taskRoutes = require('./routes/tasks');

const API_KEY = process.env.API_KEY; 
const PORT = process.env.PORT || 4000;

if (!API_KEY) {
  console.error('Fatal: Missing API_KEY (MongoDB URI) in environment variables.');
  process.exit(1);
}

async function start() {
  try {
    await mongoose.connect(API_KEY);
    console.log('MongoDB connected successfully.');

    const app = express();
    app.use(cors());
    app.use(express.json());

    app.get('/health', (_req, res) => res.status(200).json({ status: 'ok' }));

    // Example external call using axios (replace URL as needed)
    app.get('/external/ping', async (_req, res) => {
      try {
        const { data } = await axios.get('https://httpbin.org/get');
        return res.status(200).json({ ok: true, data });
      } catch (err) {
        return res.status(502).json({ error: 'Upstream failed', detail: err?.message });
      }
    });

    app.use('/api', authRoutes);
    app.use('/api/tasks', taskRoutes);

    app.listen(PORT, () => console.log(`API listening on http://localhost:${PORT}`));
  } catch (err) {
    console.error('Startup error:', err.message);
    process.exit(1);
  }
}

start();
