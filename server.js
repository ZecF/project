/**
 * server.js — TrafficGuard AI & Transit Vision Server
 * Express + MongoDB Atlas + FFmpeg + Video/Photo Inference
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const trafficGuardBackend = require('./trafficGuardBackend');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static Web Assets
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Mount TrafficGuard Router
app.use('/api/traffic', trafficGuardBackend);

// Web App Route
app.get(['/', '/traffic', '/trafficguard'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'trafficguard.html'));
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    service: 'TrafficGuard AI & Transit Vision',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Guard against client abort / socket EOF exceptions
process.on('uncaughtException', (err) => {
  if (err.code === 'EOF' || err.code === 'EPIPE' || err.code === 'ERR_STREAM_DESTROYED' || err.code === 'ECONNRESET') {
    return;
  }
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});

app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 TrafficGuard AI Server running on port ${PORT}`);
  console.log(`🌐 Dashboard: http://localhost:${PORT}/trafficguard.html`);
  console.log(`📡 API Base: http://localhost:${PORT}/api/traffic`);
  console.log(`====================================================`);
});
