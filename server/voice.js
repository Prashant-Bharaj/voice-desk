import { Router } from 'express';
import multer from 'multer';
import { mgaRequest } from './mgaHttp.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

function v3Base() {
  return (process.env.MGA_BASE_URL_V3 || 'https://chat.int.bayer.com/api/v3').replace(/\/$/, '');
}

function apiKey() {
  return process.env.MGA_API_KEY;
}

export const voiceRouter = Router();

voiceRouter.get('/capabilities', async (_req, res) => {
  const key = apiKey();
  if (!key) {
    res.json({ voice: false, stt: false, tts: false, reason: 'no_key' });
    return;
  }
  try {
    const upstream = await mgaRequest(`${v3Base()}/audio/capabilities`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
      timeoutMs: 20000,
    });
    if (!upstream.ok) {
      res.json({ voice: false, stt: false, tts: false, status: upstream.status });
      return;
    }
    const data = JSON.parse(upstream.body.toString('utf8') || '{}');
    const stt = !!(data.stt_enabled ?? data.stt);
    const tts = !!(data.tts_enabled ?? data.tts);
    res.json({ voice: stt || tts, stt, tts, raw: data });
  } catch (err) {
    res.json({ voice: false, stt: false, tts: false, error: String(err) });
  }
});

voiceRouter.post('/transcribe', upload.single('file'), async (req, res) => {
  const key = apiKey();
  if (!key) {
    res.status(500).json({ error: 'MGA_API_KEY nicht konfiguriert' });
    return;
  }
  if (!req.file) {
    res.status(400).json({ error: 'Audiodatei fehlt' });
    return;
  }

  try {
    const boundary = `----VoiceDesk${Date.now()}`;
    const filename = req.file.originalname || 'recording.webm';
    const mime = req.file.mimetype || 'audio/webm';
    const preamble = Buffer.from(
      `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
        `Content-Type: ${mime}\r\n\r\n`
    );
    const mid = Buffer.from(
      `\r\n--${boundary}\r\n` +
        `Content-Disposition: form-data; name="model"\r\n\r\n` +
        `whisper\r\n` +
        `--${boundary}--\r\n`
    );
    const body = Buffer.concat([preamble, req.file.buffer, mid]);

    const upstream = await mgaRequest(`${v3Base()}/audio/transcriptions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body,
      timeoutMs: 90000,
    });

    const textBody = upstream.body.toString('utf8');
    if (!upstream.ok) {
      res.status(upstream.status).json({
        error: `STT fehlgeschlagen (${upstream.status})`,
        detail: textBody.slice(0, 400),
      });
      return;
    }

    const data = JSON.parse(textBody);
    res.json({ text: (data.text || '').trim() });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

voiceRouter.post('/speak', async (req, res) => {
  const key = apiKey();
  if (!key) {
    res.status(500).json({ error: 'MGA_API_KEY nicht konfiguriert' });
    return;
  }

  const input = String(req.body?.input || '').trim();
  if (!input) {
    res.status(400).json({ error: 'input erforderlich' });
    return;
  }

  const spoken = input.length > 2000 ? `${input.slice(0, 2000)}...` : input;

  try {
    const upstream = await mgaRequest(`${v3Base()}/audio/speech`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Accept: 'audio/*, application/octet-stream',
      },
      body: JSON.stringify({
        model: 'kokoro',
        input: spoken,
        voice: req.body?.voice || 'alloy',
      }),
      timeoutMs: 15000,
    });

    if (!upstream.ok || upstream.body.length < 64) {
      res.status(502).json({
        error: 'TTS nicht verfügbar',
        fallback: 'browser',
        detail: upstream.body?.toString?.('utf8')?.slice(0, 200),
      });
      return;
    }

    res.setHeader('Content-Type', upstream.headers['content-type'] || 'audio/wav');
    res.setHeader('Content-Length', String(upstream.body.length));
    res.send(upstream.body);
  } catch (err) {
    res.status(502).json({
      error: err instanceof Error ? err.message : String(err),
      fallback: 'browser',
    });
  }
});
