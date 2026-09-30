import { useEffect, useState } from 'react';
import { api } from './lib/api.js';
import LoginScreen from './components/LoginScreen.jsx';
import ChatView from './components/ChatView.jsx';

export default function App() {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    api('/api/auth/me')
      .then((data) => setUser(data.user))
      .catch(() => setUser(null))
      .finally(() => setBooting(false));
  }, []);

  if (booting) {
    return (
      <div className="login-view">
        <p style={{ color: 'var(--mute)' }}>Lädt…</p>
      </div>
    );
  }

  return (
    <div className="app-shell">
      {user ? (
        <ChatView user={user} onLogout={() => setUser(null)} />
      ) : (
        <LoginScreen onLogin={setUser} />
      )}
    </div>
  );
}
