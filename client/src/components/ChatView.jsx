import { useCallback, useEffect, useRef, useState } from 'react';
import { api, speakText, speakWithBrowser, streamChat, transcribeBlob } from '../lib/api.js';

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z" />
      <path d="M19 11a7 7 0 0 1-14 0" />
      <path d="M12 18v3" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

function getMimeType() {
  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
  for (const t of types) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) return t;
  }
  return '';
}

export default function ChatView({ user, onLogout }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [voiceOk, setVoiceOk] = useState(false);
  const [playingId, setPlayingId] = useState(null);
  const listRef = useRef(null);
  const mediaRef = useRef(null);
  const chunksRef = useRef([]);
  const audioRef = useRef(null);
  const touchDevice =
    typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);

  useEffect(() => {
    api('/api/voice/capabilities')
      .then((cap) => setVoiceOk(Boolean(cap.stt || cap.voice)))
      .catch(() => setVoiceOk(false));
  }, []);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, status]);

  const playReply = useCallback(async (id, text) => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    if (playingId === id) {
      setPlayingId(null);
      return;
    }
    setPlayingId(id);
    setStatus('Spricht…');
    try {
      try {
        const blob = await speakText(text);
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioRef.current = audio;
        await new Promise((resolve, reject) => {
          audio.onended = () => {
            URL.revokeObjectURL(url);
            audioRef.current = null;
            resolve();
          };
          audio.onerror = reject;
          audio.play().catch(reject);
        });
      } catch {
        await speakWithBrowser(text);
      }
    } catch (err) {
      setStatus(err.message || 'Sprachausgabe fehlgeschlagen');
    } finally {
      setPlayingId(null);
      setStatus('');
    }
  }, [playingId]);

  const sendMessage = useCallback(
    async (text, { speak } = {}) => {
      const content = String(text || '').trim();
      if (!content || busy) return;

      const next = [...messages, { role: 'user', content }];
      setMessages(next);
      setInput('');
      setBusy(true);
      setStatus('Denkt nach…');

      let assistantText = '';
      setMessages([...next, { role: 'assistant', content: '' }]);

      try {
        await streamChat(
          next.map((m) => ({ role: m.role, content: m.content })),
          (ev) => {
            if (ev.delta) {
              assistantText += ev.delta;
              setMessages([...next, { role: 'assistant', content: assistantText }]);
            }
            if (ev.error) setStatus(ev.error);
            if (ev.done) setStatus('');
          }
        );
        if (!assistantText.trim()) {
          setMessages([
            ...next,
            { role: 'assistant', content: 'Keine Antwort erhalten. Bitte noch einmal versuchen.' },
          ]);
        } else if (speak) {
          const replyIndex = next.length;
          setTimeout(() => playReply(replyIndex, assistantText), 0);
        }
      } catch (err) {
        setStatus(err.message || 'Fehler beim Chat');
        setMessages([
          ...next,
          { role: 'assistant', content: 'Entschuldigung, die Anfrage ist fehlgeschlagen.' },
        ]);
      } finally {
        setBusy(false);
      }
    },
    [busy, messages, playReply]
  );

  async function finishRecording(blob) {
    setStatus('Transkribiere…');
    try {
      const { text } = await transcribeBlob(blob);
      if (text) {
        setStatus('');
        await sendMessage(text, { speak: true });
      } else {
        setStatus('Keine Sprache erkannt');
      }
    } catch (err) {
      setStatus(err.message || 'Spracherkennung fehlgeschlagen');
    }
  }

  async function startRecording() {
    if (recording || busy) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      const mime = getMimeType();
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      mediaRef.current = recorder;
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        await finishRecording(blob);
      };
      recorder.start();
      setRecording(true);
      setStatus('Hört zu… loslassen zum Senden');
    } catch {
      setStatus('Mikrofonzugriff verweigert');
    }
  }

  function stopRecording() {
    if (!recording || !mediaRef.current) return;
    mediaRef.current.stop();
    mediaRef.current = null;
    setRecording(false);
  }

  async function handleLogout() {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } finally {
      onLogout();
    }
  }

  return (
    <div className="chat-view">
      <header className="topbar">
        <h1>Voice Desk</h1>
        <div className="topbar-meta">
          <span>{user?.name}</span>
          <button type="button" className="btn btn-ghost" onClick={handleLogout}>
            Abmelden
          </button>
        </div>
      </header>

      <div className="messages" ref={listRef}>
        {messages.length === 0 ? (
          <div className="empty-hint">
            <strong>Womit kann ich helfen?</strong>
            Tippen oder Mikrofon gedrückt halten — MGA whisper / kokoro.
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={`bubble ${m.role}`}>
              {m.content || (m.role === 'assistant' && busy ? '…' : '')}
              {m.role === 'assistant' && m.content ? (
                <div className="bubble-actions">
                  <button
                    type="button"
                    className={`icon-btn ${playingId === i ? 'playing' : ''}`}
                    onClick={() => playReply(i, m.content)}
                  >
                    Vorlesen
                  </button>
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>

      <div className="status-line" aria-live="polite">
        {status}
      </div>

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          sendMessage(input);
        }}
      >
        {voiceOk ? (
          <button
            type="button"
            className={`mic-btn ${recording ? 'recording' : ''}`}
            title={touchDevice ? 'Tippen: Aufnahme starten/stoppen' : 'Gedrückt halten zum Sprechen'}
            onMouseDown={(e) => {
              if (touchDevice) return;
              e.preventDefault();
              startRecording();
            }}
            onMouseUp={() => {
              if (!touchDevice) stopRecording();
            }}
            onMouseLeave={() => {
              if (!touchDevice && recording) stopRecording();
            }}
            onClick={() => {
              if (!touchDevice) return;
              if (recording) stopRecording();
              else startRecording();
            }}
            disabled={busy && !recording}
          >
            <MicIcon />
          </button>
        ) : null}
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={voiceOk ? 'Nachricht oder sprechen…' : 'Nachricht schreiben…'}
          disabled={busy || recording}
          aria-label="Nachricht"
        />
        <button className="send-btn" type="submit" disabled={busy || !input.trim()} aria-label="Senden">
          <SendIcon />
        </button>
      </form>
    </div>
  );
}
