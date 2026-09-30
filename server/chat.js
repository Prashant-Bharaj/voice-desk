import { Router } from 'express';

const SYSTEM_PROMPT =
  'Du bist Voice Desk, ein hilfreicher Assistent. Antworte klar und knapp auf Deutsch.';

function mgaConfig() {
  const key = process.env.MGA_API_KEY;
  const base = (process.env.MGA_BASE_URL_V2 || 'https://chat.int.bayer.com/api/v2').replace(
    /\/$/,
    ''
  );
  const model = process.env.MGA_CHAT_MODEL || 'claude-sonnet-5';
  return { key, base, model };
}

function sendSse(res, obj) {
  res.write(`data: ${JSON.stringify(obj)}\n\n`);
  if (typeof res.flush === 'function') res.flush();
}

export const chatRouter = Router();

chatRouter.post('/', async (req, res) => {
  const { key, base, model } = mgaConfig();
  if (!key) {
    res.status(500).json({ error: 'MGA_API_KEY nicht konfiguriert' });
    return;
  }

  const messages = Array.isArray(req.body?.messages) ? req.body.messages : null;
  if (!messages || messages.length === 0) {
    res.status(400).json({ error: 'messages erforderlich' });
    return;
  }

  const safeMessages = messages
    .filter(
      (m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string'
    )
    .map((m) => ({ role: m.role, content: m.content }));

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  if (typeof res.flushHeaders === 'function') res.flushHeaders();

  try {
    const upstream = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...safeMessages],
        stream: true,
        max_tokens: 2048,
      }),
    });

    if (!upstream.ok) {
      const txt = await upstream.text().catch(() => '');
      sendSse(res, { error: `MGA HTTP ${upstream.status}: ${txt.slice(0, 400)}` });
      res.end();
      return;
    }
    if (!upstream.body) {
      sendSse(res, { error: 'Keine Antwort vom Modell' });
      res.end();
      return;
    }

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let sawContent = false;

    const handleLine = (line) => {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) return;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === '[DONE]') return;
      try {
        const parsed = JSON.parse(payload);
        const delta = parsed.choices?.[0]?.delta?.content;
        if (typeof delta === 'string' && delta) {
          sawContent = true;
          sendSse(res, { delta });
        }
      } catch {
        /* ignore */
      }
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split('\n');
      buf = parts.pop() || '';
      for (const line of parts) handleLine(line);
    }
    if (buf) handleLine(buf);

    if (!sawContent) {
      // Non-stream fallback when SSE yields no text deltas
      const fallback = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...safeMessages],
          stream: false,
          max_tokens: 2048,
        }),
      });
      if (fallback.ok) {
        const data = await fallback.json();
        const content = data.choices?.[0]?.message?.content;
        if (content) sendSse(res, { delta: content });
      }
    }

    sendSse(res, { done: true, model });
    res.end();
  } catch (err) {
    sendSse(res, { error: err instanceof Error ? err.message : String(err) });
    res.end();
  }
});
