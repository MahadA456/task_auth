
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

    const server = app.listen(PORT, () => console.log(`API listening on http://localhost:${PORT}`));

    // Socket.IO setup
    const { Server } = require('socket.io');
    const io = new Server(server, {
      cors: { origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE'] }
    });

    const communityRoom = 'community';
    const presence = new Map(); // socketId -> { userId, fullName, email }

    io.on('connection', (socket) => {
      // Editing indicator
      socket.on('community:editing:start', ({ taskId, user }) => {
        io.to(communityRoom).emit('community:editing', { taskId, user, editing: true })
      })
      socket.on('community:editing:stop', ({ taskId, user }) => {
        io.to(communityRoom).emit('community:editing', { taskId, user, editing: false })
      })
      socket.on('community:join', (user) => {
        socket.join(communityRoom);
        presence.set(socket.id, user || {});
        io.to(communityRoom).emit('community:presence', Array.from(presence.values()));
        if (user?.fullName || user?.email) {
          io.to(communityRoom).emit('community:notice', { type: 'join', user });
        }
      });

      socket.on('community:leave', () => {
        socket.leave(communityRoom);
        presence.delete(socket.id);
        io.to(communityRoom).emit('community:presence', Array.from(presence.values()));
      });

      socket.on('disconnect', () => {
        const user = presence.get(socket.id);
        presence.delete(socket.id);
        io.to(communityRoom).emit('community:presence', Array.from(presence.values()));
        if (user?.fullName || user?.email) {
          io.to(communityRoom).emit('community:notice', { type: 'leave', user });
        }
      });
    });

    // Expose io for routes
    app.set('io', io);
  } catch (err) {
    console.error('Startup error:', err.message);
    process.exit(1);
  }
}

start();
