import 'dotenv/config';
import https from 'https';
import fs from 'node:fs';

const key = process.env.MGA_API_KEY;
const v3 = process.env.MGA_BASE_URL_V3;
const v2 = process.env.MGA_BASE_URL_V2;
const model = process.env.MGA_CHAT_MODEL || 'claude-sonnet-5';

function httpsJson(urlStr, bodyObj) {
  const body = JSON.stringify(bodyObj);
  const u = new URL(urlStr);
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          Accept: 'application/json',
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (d) => chunks.push(d));
        res.on('end', () => {
          resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) });
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function httpsGet(urlStr) {
  const u = new URL(urlStr);
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: 'GET',
        headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
      },
      (res) => {
        const chunks = [];
        res.on('data', (d) => chunks.push(d));
        res.on('end', () => {
          resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) });
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

const caps = await httpsGet(`${v3}/audio/capabilities`);
console.log('caps', caps.status, caps.body.toString());

const tts = await httpsJson(`${v3}/audio/speech`, {
  model: 'kokoro',
  input: 'Hallo Voice Desk',
  voice: 'alloy',
});
console.log('tts', tts.status, tts.headers['content-type'], tts.body.length);
fs.writeFileSync(`${process.env.TEMP}\\vd-tts-https.bin`, tts.body);
if (tts.body.length < 300) console.log(tts.body.toString());

// built-in fetch stream chat
const r = await fetch(`${v2}/chat/completions`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model,
    messages: [{ role: 'user', content: 'Sag Hallo kurz' }],
    stream: true,
    max_tokens: 50,
  }),
});
const full = await r.text();
const deltas = [];
for (const line of full.split('\n')) {
  if (!line.startsWith('data:')) continue;
  const p = line.slice(5).trim();
  if (!p || p === '[DONE]') continue;
  try {
    const j = JSON.parse(p);
    const c = j.choices?.[0]?.delta?.content;
    if (c) deltas.push(c);
  } catch {
    /* ignore */
  }
}
console.log('chat status', r.status);
console.log('chat deltas', JSON.stringify(deltas.join('')));

const tools = [
  {
    type: 'function',
    function: {
      name: 'create_word',
      description: 'Word doc',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          body: { type: 'string' },
        },
        required: ['title', 'body'],
      },
    },
  },
];
const r2 = await fetch(`${v2}/chat/completions`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model,
    messages: [
      {
        role: 'user',
        content: 'Erstelle ein Word mit Titel Test und Text Hello. Nutze das Tool.',
      },
    ],
    tools,
    tool_choice: 'auto',
    stream: false,
  }),
});
const j = await r2.json();
console.log('tools status', r2.status);
console.log(
  'tools msg',
  JSON.stringify(j.choices?.[0]?.message || j.error || j).slice(0, 1200)
);
