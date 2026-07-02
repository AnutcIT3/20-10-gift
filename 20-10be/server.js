const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
require('dotenv').config();

const pool = require('./config/db');
const { generalLimiter } = require('./middleware/rateLimit');
const errorHandler = require('./middleware/errorHandler');
const resolveRoutes = require('./routes/resolve');
const giftRoutes = require('./routes/gifts');
const authRoutes = require('./routes/auth');
const studentRoutes = require('./routes/students');
const { adminStudentGalleryRouter, galleryRouter } = require('./routes/gallery-admin');
const { adminLettersRouter, lettersRouter } = require('./routes/letters-admin');
const greetingRoutes = require('./routes/greetings');

const app = express();
const PORT = process.env.PORT || 5001;

const allowedOrigins = [
  'http://localhost:5173',
  process.env.FRONTEND_URL,
].filter(Boolean);

app.set('trust proxy', 1);

app.use(helmet());
app.use((req, res, next) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  next();
});
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
}));
app.use(compression());
app.use(express.json());
app.use(generalLimiter);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/ready', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ready', db: 'connected', timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'not ready', db: 'disconnected' });
  }
});

app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send('User-agent: *\nDisallow: /\n');
});

app.use('/api/students', resolveRoutes);
app.use('/api/gifts', giftRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/admin/students', adminStudentGalleryRouter);
app.use('/api/gallery', galleryRouter);
app.use('/api/admin/letters', adminLettersRouter);
app.use('/api/letters', lettersRouter);
app.use('/api/greetings', greetingRoutes);

app.use(errorHandler);

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;
