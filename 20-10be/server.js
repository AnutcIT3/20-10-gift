const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
require('dotenv').config();

const pool = require('./config/db');
const errorHandler = require('./middleware/errorHandler');
const resolveRoutes = require('./routes/resolve');
const giftRoutes = require('./routes/gifts');
const authRoutes = require('./routes/auth');
const studentRoutes = require('./routes/students');
const { adminStudentGalleryRouter, galleryRouter } = require('./routes/gallery-admin');
const { adminLettersRouter, lettersRouter } = require('./routes/letters-admin');
const greetingRoutes = require('./routes/greetings');
const adminStatsRoutes = require('./routes/admin-stats');
const { generalLimiter } = require('./middleware/rateLimit');

const app = express();
const PORT = process.env.PORT || 5001;

const allowedOrigins = [
  'http://localhost:5173',
  process.env.FRONTEND_URL,
].filter(Boolean);

function isCorsOriginAllowed(origin, requestHost, requestProtocol) {
  if (!origin) return true;

  try {
    const parsedOrigin = new URL(origin);
    const sameOrigin = parsedOrigin.origin === `${requestProtocol}://${requestHost}`;
    return sameOrigin || allowedOrigins.includes(parsedOrigin.origin);
  } catch {
    return false;
  }
}

app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      imgSrc: ["'self'", 'data:', 'https://res.cloudinary.com'],
      mediaSrc: ["'self'", 'https://res.cloudinary.com'],
      connectSrc: ["'self'"],
    },
  },
}));
app.use((req, res, next) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  next();
});
app.use(cors((req, callback) => {
  const origin = req.get('Origin');
  if (isCorsOriginAllowed(origin, req.get('host'), req.protocol)) {
    return callback(null, { origin: Boolean(origin) });
  }

  return callback(Object.assign(new Error('Not allowed by CORS'), { statusCode: 403 }));
}));
app.use(compression());
app.use('/api', generalLimiter);
app.use(express.json({ limit: '100kb' }));

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
app.use('/api/admin', adminStatsRoutes);

// ── Serve frontend build (kích hoạt khi SERVE_STATIC=true hoặc NODE_ENV=production) ──
const serveStatic = process.env.SERVE_STATIC === 'true' || process.env.NODE_ENV === 'production';
if (serveStatic) {
  const DIST = path.join(__dirname, '..', '20-10fe', 'dist');
  app.use(express.static(DIST, {
    setHeaders(res, filePath) {
      if (path.basename(filePath) === 'index.html') {
        res.setHeader('Cache-Control', 'no-cache');
      } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else {
        res.setHeader('Cache-Control', 'public, max-age=86400');
      }
    },
  }));
  // SPA fallback: mọi route không phải /api đều trả index.html
  app.get('*', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(DIST, 'index.html'));
  });
}

app.use(errorHandler);

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;
module.exports.isCorsOriginAllowed = isCorsOriginAllowed;
