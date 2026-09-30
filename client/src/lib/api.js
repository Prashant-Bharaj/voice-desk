async function parseJson(res) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { error: text || res.statusText };
  }
}

export async function api(path, options = {}) {
  const res = await fetch(path, {
    credentials: 'include',
    ...options,
    headers: {
      ...(options.body && !(options.body instanceof FormData)
        ? { 'Content-Type': 'application/json' }
        : {}),
      ...options.headers,
    },
  });
  const data = await parseJson(res);
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export async function streamChat(messages, onEvent) {
  const res = await fetch('/api/chat', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  });

  if (!res.ok) {
    const data = await parseJson(res);
    throw new Error(data.error || `Chat HTTP ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  const handleLine = (line) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) return;
    const payload = trimmed.slice(5).trim();
    if (!payload) return;
    try {
      onEvent(JSON.parse(payload));
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
}

export async function transcribeBlob(blob) {
  const ext = blob.type.includes('webm')
    ? 'webm'
    : blob.type.includes('ogg')
      ? 'ogg'
      : blob.type.includes('mp4')
        ? 'mp4'
        : 'webm';
  const form = new FormData();
  form.append('file', new File([blob], `recording.${ext}`, { type: blob.type || 'audio/webm' }));
  return api('/api/voice/transcribe', { method: 'POST', body: form });
}

export async function speakText(text) {
  const res = await fetch('/api/voice/speak', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: text }),
  });
  if (!res.ok) {
    const data = await parseJson(res);
    const err = new Error(data.error || `TTS HTTP ${res.status}`);
    err.fallback = data.fallback === 'browser';
    throw err;
  }
  return res.blob();
}

export function speakWithBrowser(text) {
  return new Promise((resolve, reject) => {
    if (!('speechSynthesis' in window)) {
      reject(new Error('Keine Sprachausgabe verfügbar'));
      return;
    }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'de-DE';
    u.onend = () => resolve();
    u.onerror = () => reject(new Error('Browser-TTS fehlgeschlagen'));
    window.speechSynthesis.speak(u);
  });
}
