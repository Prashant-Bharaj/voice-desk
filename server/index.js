import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { requireAuth, authRouter } from './auth.js';
import { chatRouter } from './chat.js';
import { voiceRouter } from './voice.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const isProd = process.env.NODE_ENV === 'production';
const port = Number(process.env.PORT || 8787);
const clientOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5180';

const app = express();

app.use(
  cors({
    origin: isProd ? false : clientOrigin,
    credentials: true,
  })
);
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));
app.use(
  session({
    name: 'voice_desk_sid',
    secret: process.env.SESSION_SECRET || 'dev-voice-desk-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      maxAge: 8 * 60 * 60 * 1000,
    },
  })
);

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    mgaKey: Boolean(process.env.MGA_API_KEY),
    model: process.env.MGA_CHAT_MODEL || 'claude-sonnet-5',
  });
});

app.use('/api/auth', authRouter);
app.use('/api/chat', requireAuth, chatRouter);
app.use('/api/voice', requireAuth, voiceRouter);

if (isProd) {
  const dist = path.join(root, 'dist');
  app.use(express.static(dist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(dist, 'index.html'));
  });
}

app.use((err, _req, res, _next) => {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error('[voice-desk]', err);
  res.status(status).json({ error: err.message || 'Interner Fehler' });
});

app.listen(port, () => {
  console.log(`Voice Desk API auf http://localhost:${port}`);
  if (!process.env.MGA_API_KEY) {
    console.warn('Warnung: MGA_API_KEY fehlt — Chat wird fehlschlagen.');
  }
});
