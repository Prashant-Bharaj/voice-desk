# Voice Desk (Minimal-MVP)

Deutscher Chat-Assistent mit myGenAssist — bewusst klein gehalten.

**Jetzt:** Login + Text-Chat (MGA v2) + Voice (v3 `whisper` STT / `kokoro` TTS)  
**Später:** Word, E-Mail

## Start

```powershell
cd voice-desk
copy .env.example .env
# MGA_API_KEY setzen

npm.cmd install --proxy http://163.116.128.80:80 --https-proxy http://163.116.128.80:80
npm.cmd run dev
```

- UI: http://localhost:5180  
- API: http://localhost:8787  
- Login: `demo` / `voice-desk` (siehe `.env`)
