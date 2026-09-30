import 'dotenv/config';

const key = process.env.MGA_API_KEY;
const base = process.env.MGA_BASE_URL_V2;
const model = process.env.MGA_CHAT_MODEL;
console.log({ hasKey: Boolean(key), base, model });

const r = await fetch(`${base}/chat/completions`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model,
    messages: [{ role: 'user', content: 'Sag Hallo' }],
    stream: true,
    max_tokens: 64,
  }),
});
const t = await r.text();
console.log('status', r.status);
console.log(t.slice(0, 800));
console.log('double-nl', (t.match(/\n\n/g) || []).length);
console.log('content field', t.includes('"content":"'));
