/*
const express = require('express');
const cors    = require('cors');

const authRoutes    = require('../src/routes/auth');
const projectRoutes = require('../src/routes/projects');
const adminRoutes   = require('../src/routes/admin');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/auth',    authRoutes);
app.use('/projects', projectRoutes);
app.use('/admin',   adminRoutes);

app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found.` });
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'An unexpected error occurred.' });
});

const serverless = require("serverless-http");
module.exports = serverless(app);
*/
const express = require('express');
const cors    = require('cors');

const authRoutes    = require('../src/routes/auth');
const projectRoutes = require('../src/routes/projects');
const adminRoutes   = require('../src/routes/admin');

const app = express();

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT','PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/auth',     authRoutes);
app.use('/projects', projectRoutes);
app.use('/admin',    adminRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});


module.exports = app;