import json
import urllib.request
import http.cookiejar

base = "http://localhost:8787"
cj = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))


def req(method, path, data=None, raw=False):
    h = {}
    body = None
    if data is not None:
        body = json.dumps(data).encode("utf-8")
        h["Content-Type"] = "application/json"
    r = urllib.request.Request(base + path, data=body, headers=h, method=method)
    try:
        with opener.open(r, timeout=120) as resp:
            content = resp.read()
            if raw:
                return resp.status, content
            return resp.status, json.loads(content.decode() or "null")
    except urllib.error.HTTPError as e:
        content = e.read()
        try:
            parsed = json.loads(content.decode() or "null")
        except Exception:
            parsed = content[:300]
        return e.code, parsed


print("HEALTH", req("GET", "/api/health")[1])
print("LOGIN_BAD", req("POST", "/api/auth/login", {"username": "demo", "password": "x"})[0])
print("LOGIN_OK", req("POST", "/api/auth/login", {"username": "demo", "password": "voice-desk"})[1])
print("ME", req("GET", "/api/auth/me")[1])
print("CAPS", req("GET", "/api/voice/capabilities")[1])

r = urllib.request.Request(
    base + "/api/chat",
    data=json.dumps(
        {
            "messages": [
                {"role": "user", "content": "Sag nur Hallo in einem kurzen Satz auf Deutsch."}
            ]
        }
    ).encode(),
    headers={"Content-Type": "application/json"},
    method="POST",
)
chunks = []
tools = []
errors = []
with opener.open(r, timeout=120) as resp:
    buf = b""
    while True:
        piece = resp.read(256)
        if not piece:
            break
        buf += piece
        while b"\n\n" in buf:
            block, buf = buf.split(b"\n\n", 1)
            for line in block.split(b"\n"):
                if line.startswith(b"data:"):
                    payload = line[5:].strip()
                    if not payload:
                        continue
                    try:
                        ev = json.loads(payload)
                    except Exception:
                        continue
                    if "delta" in ev:
                        chunks.append(ev["delta"])
                    if "tool" in ev:
                        tools.append(ev)
                    if "error" in ev:
                        errors.append(ev["error"])
print("CHAT_TEXT", "".join(chunks))
print("CHAT_ERRORS", errors)

status, body = req("POST", "/api/voice/speak", {"input": "Hallo"}, raw=True)
print("TTS", status, "bytes=", len(body) if isinstance(body, (bytes, bytearray)) else body)

r2 = urllib.request.Request(
    base + "/api/chat",
    data=json.dumps(
        {
            "messages": [
                {
                    "role": "user",
                    "content": "Erstelle bitte ein kurzes Word-Dokument mit dem Titel Testnotiz und dem Text: Voice Desk funktioniert. Nutze das Tool create_word.",
                }
            ]
        }
    ).encode(),
    headers={"Content-Type": "application/json"},
    method="POST",
)
tools2 = []
text2 = []
with opener.open(r2, timeout=120) as resp:
    buf = b""
    while True:
        piece = resp.read(256)
        if not piece:
            break
        buf += piece
        while b"\n\n" in buf:
            block, buf = buf.split(b"\n\n", 1)
            for line in block.split(b"\n"):
                if line.startswith(b"data:"):
                    payload = line[5:].strip()
                    if not payload:
                        continue
                    try:
                        ev = json.loads(payload)
                    except Exception:
                        continue
                    if "delta" in ev:
                        text2.append(ev["delta"])
                    if "tool" in ev:
                        tools2.append(ev)
print("WORD_TOOL", tools2)
print("WORD_TEXT", "".join(text2)[:200])
