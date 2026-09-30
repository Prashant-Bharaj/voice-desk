import 'dotenv/config';

const key = process.env.MGA_API_KEY;
const v2 = process.env.MGA_BASE_URL_V2;
const model = process.env.MGA_CHAT_MODEL || 'claude-sonnet-5';

const body = {
  model,
  messages: [
    { role: 'system', content: 'Antworte kurz auf Deutsch.' },
    { role: 'user', content: 'Sag nur Hallo.' },
  ],
  stream: true,
  max_tokens: 256,
};

const r = await fetch(`${v2}/chat/completions`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(body),
});

const full = await r.text();
console.log('status', r.status, 'len', full.length);
const lines = full.split('\n').filter((l) => l.startsWith('data:'));
console.log('events', lines.length);
let text = '';
for (const line of lines.slice(0, 8)) {
  console.log('SAMPLE', line.slice(0, 220));
}
for (const line of lines) {
  const p = line.slice(5).trim();
  if (!p || p === '[DONE]') continue;
  try {
    const j = JSON.parse(p);
    const d = j.choices?.[0]?.delta || {};
    if (d.content) text += d.content;
    if (j.choices?.[0]?.finish_reason) console.log('finish', j.choices[0].finish_reason);
  } catch {
    /* ignore */
  }
}
console.log('TEXT', JSON.stringify(text));
