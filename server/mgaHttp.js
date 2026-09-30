import https from 'node:https';
import { URL } from 'node:url';

/** HTTPS helper — Node fetch often drops MGA audio bodies behind Netskope. */
export function mgaRequest(urlStr, { method = 'GET', headers = {}, body, timeoutMs = 60000 } = {}) {
  const u = new URL(urlStr);
  const payload = body == null ? null : Buffer.isBuffer(body) ? body : Buffer.from(body);

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, arg) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(arg);
    };

    const req = https.request(
      {
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        method,
        headers: {
          ...headers,
          ...(payload ? { 'Content-Length': payload.length } : {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (d) => chunks.push(d));
        res.on('end', () => {
          finish(resolve, {
            status: res.statusCode || 0,
            headers: res.headers,
            body: Buffer.concat(chunks),
            ok: (res.statusCode || 0) >= 200 && (res.statusCode || 0) < 300,
          });
        });
        res.on('error', (err) => finish(reject, err));
      }
    );

    const timer = setTimeout(() => {
      req.destroy();
      finish(reject, new Error(`MGA timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    req.on('error', (err) => finish(reject, err));
    if (payload) req.write(payload);
    req.end();
  });
}
