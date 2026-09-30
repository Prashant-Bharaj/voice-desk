import { Router } from 'express';

export function requireAuth(req, res, next) {
  if (req.session?.user) return next();
  res.status(401).json({ error: 'Nicht angemeldet' });
}

export const authRouter = Router();

authRouter.post('/login', (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  const demoUser = process.env.DEMO_USER || 'demo';
  const demoPassword = process.env.DEMO_PASSWORD || 'voice-desk';

  if (username !== demoUser || password !== demoPassword) {
    res.status(401).json({ error: 'Ungültige Anmeldedaten' });
    return;
  }

  req.session.user = { name: username };
  res.json({ user: { name: username } });
});

authRouter.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('voice_desk_sid');
    res.json({ ok: true });
  });
});

authRouter.get('/me', (req, res) => {
  if (!req.session?.user) {
    res.status(401).json({ error: 'Nicht angemeldet' });
    return;
  }
  res.json({ user: req.session.user });
});
