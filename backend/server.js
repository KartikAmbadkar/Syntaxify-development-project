'use strict';

require('dotenv').config();

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const OpenAI = require('openai');

const { explain, HttpError, MAX_CHARS } = require('./lib/explain');
const { loadFallback } = require('./lib/fallback');

const PORT = Number(process.env.PORT) || 3000;
const MODEL = process.env.LLM_MODEL;
const PER_MINUTE = Number(process.env.RATE_LIMIT_PER_MIN) || 10;

const client = process.env.LLM_API_KEY
  ? new OpenAI({ apiKey: process.env.LLM_API_KEY, baseURL: process.env.LLM_BASE_URL, timeout: 60_000, maxRetries: 1 })
  : null;
const fallback = loadFallback();

if (!client) console.warn('ANTHROPIC_API_KEY is not set: using the built-in rules only.');
if (!client && !fallback) console.warn('No fallback engine found either: /api/explain will return 503.');

const app = express();
app.disable('x-powered-by');
if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
  
      'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      'font-src': ["'self'", 'https://fonts.gstatic.com'],
    },
  },
}));

app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

app.get('/api/health', (req, res) => res.json({ ok: true, ai: Boolean(client) }));

app.post(
  '/api/explain',
  rateLimit({
    windowMs: 60_000,
    limit: PER_MINUTE,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Please wait a minute and try again.' },
  }),
  express.json({ limit: Math.ceil(MAX_CHARS * 4 / 1024) + 'kb' }), 
  async (req, res, next) => {
    try {
      res.set('Cache-Control', 'no-store');
      res.json(await explain({ client, model: MODEL, fallback, body: req.body }));
    } catch (err) {
      next(err);
    }
  },
);


app.use('/api', (err, req, res, next) => { 
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'That code is too long.' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON.' });
  console.error(err);
  return res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

app.listen(PORT, () => console.log(`Syntaxify running at http://localhost:${PORT}`));
