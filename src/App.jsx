import React, { useState, useEffect, useRef } from 'react';
import YouTube from 'react-youtube';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, onValue, set, push, limitToLast, query as fbQuery } from 'firebase/database';
import { Search, Play, Music, Users, Send, MessageSquare, Headphones } from 'lucide-react';

// --- CONFIGURATION ---
const firebaseConfig = {
  apiKey: "AIzaSyDUIIsT9yYQGcQgYpolTAoYvjsy_cssKlQ",
  authDomain: "watch-party-65807.firebaseapp.com",
  projectId: "watch-party-65807",
  storageBucket: "watch-party-65807.firebasestorage.app",
  messagingSenderId: "969287261247",
  appId: "1:969287261247:web:1fe057a70644c16892ac8a",
  databaseURL: "https://watch-party-65807-default-rtdb.asia-southeast1.firebasedatabase.app" // Standard Firebase DB URL format
};

const YT_API_KEY = "AIzaSyBIjyXvo--T-3u7T0ooF1BQiJQm8uDNqJY";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

export default function App() {
  const [room, setRoom] = useState("");
  const [joined, setJoined] = useState(false);
  const [videoId, setVideoId] = useState("dQw4w9WgXcQ");
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [chat, setChat] = useState([]);
  const [msgInput, setMsgInput] = useState("");

  const playerRef = useRef(null);
  const isIncomingSync = useRef(false);

  // --- SYNC LOGIC ---
  useEffect(() => {
    if (!joined || !room) return;

    // Listen for Video Sync (Play/Pause/Change)
    const stateRef = ref(db, `rooms/${room}/state`);
    onValue(stateRef, async (snapshot) => {
      const data = snapshot.val();
      if (!data || !playerRef.current) return;

      const player = playerRef.current.internalPlayer;
      isIncomingSync.current = true;

      if (data.videoId !== videoId) setVideoId(data.videoId);

      const playerState = await player.getPlayerState();
      if (data.action === 'play' && playerState !== 1) player.playVideo();
      if (data.action === 'pause' && playerState !== 2) player.pauseVideo();

      const currentTime = await player.getCurrentTime();
      if (Math.abs(data.time - currentTime) > 2) {
        player.seekTo(data.time);
      }

      setTimeout(() => { isIncomingSync.current = false; }, 600);
    });

    // Listen for Chat
    const chatRef = fbQuery(ref(db, `rooms/${room}/chat`), limitToLast(20));
    onValue(chatRef, (snapshot) => {
      const data = snapshot.val();
      if (data) setChat(Object.values(data));
    });
  }, [joined, room, videoId]);

  // --- ACTIONS ---
  const broadcast = async (action) => {
    if (isIncomingSync.current) return;
    const player = playerRef.current.internalPlayer;
    const time = await player.getCurrentTime();
    set(ref(db, `rooms/${room}/state`), { action, time, videoId });
  };

  const searchSongs = async () => {
    if (!searchTerm) return;
    const res = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=10&q=${searchTerm}&type=video&key=${YT_API_KEY}`);
    const data = await res.json();
    setSearchResults(data.items || []);
  };

  const sendChatMessage = () => {
    if (!msgInput) return;
    push(ref(db, `rooms/${room}/chat`), { text: msgInput, time: Date.now() });
    setMsgInput("");
  };

  if (!joined) return (
    <div style={styles.loginPage}>
      <div style={styles.loginCard}>
        <div style={styles.logoCircle}><Headphones size={40} color="#1DB954"/></div>
        <h1 style={{margin: '10px 0'}}>SyncEar</h1>
        <p style={{color: '#888', marginBottom: '25px'}}>6 Friends. 3 Devices. 1 Beat.</p>
        <input 
          style={styles.loginInput} 
          placeholder="Enter Room Name" 
          onChange={e => setRoom(e.target.value.toLowerCase())}
          onKeyPress={e => e.key === 'Enter' && room && setJoined(true)}
        />
        <button style={styles.loginBtn} onClick={() => room && setJoined(true)}>Start Syncing</button>
      </div>
    </div>
  );

  return (
    <div style={styles.container}>
      {/* Sidebar: Search & Results */}
      <div style={styles.sidebar}>
        <div style={styles.brand}><Music color="#1DB954"/> <b>SyncEar</b></div>
        <div style={styles.searchBox}>
          <input 
            style={styles.searchInput} 
            placeholder="Search songs..." 
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            onKeyPress={e => e.key === 'Enter' && searchSongs()}
          />
          <button onClick={searchSongs} style={styles.searchBtn}><Search size={18}/></button>
        </div>
        <div style={styles.resultsList}>
          {searchResults.map(song => (
            <div key={song.id.videoId} style={styles.songCard} onClick={() => {
              setVideoId(song.id.videoId);
              set(ref(db, `rooms/${room}/state`), { action: 'play', time: 0, videoId: song.id.videoId });
            }}>
              <img src={song.snippet.thumbnails.default.url} style={styles.thumb} />
              <div>
                <div style={styles.songTitle}>{song.snippet.title.substring(0, 40)}</div>
                <div style={styles.playTag}><Play size={10} fill="#1DB954"/> Tap to play for all</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Main Content: Player & Chat */}
      <div style={styles.main}>
        <div style={styles.header}>
          <div style={styles.roomBadge}><Users size={14}/> Room: {room}</div>
        </div>
        
        <div style={styles.videoArea}>
          <YouTube 
            videoId={videoId} 
            ref={playerRef}
            onPlay={() => broadcast('play')}
            onPause={() => broadcast('pause')}
            opts={{ width: '100%', height: '100%', playerVars: { autoplay: 1, rel: 0 } }}
            style={{height: '400px'}}
          />
        </div>

        <div style={styles.chatArea}>
          <div style={styles.chatHeader}><MessageSquare size={16}/> Group Chat</div>
          <div style={styles.messages}>
            {chat.map((m, i) => (
              <div key={i} style={styles.msgBubble}>{m.text}</div>
            ))}
          </div>
          <div style={styles.chatInputRow}>
            <input 
              style={styles.chatInput} 
              placeholder="Send message..." 
              value={msgInput}
              onChange={e => setMsgInput(e.target.value)}
              onKeyPress={e => e.key === 'Enter' && sendChatMessage()}
            />
            <button onClick={sendChatMessage} style={styles.sendBtn}><Send size={18}/></button>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- STYLING ---
const styles = {
  container: { display: 'flex', height: '100vh', backgroundColor: '#000', color: '#fff', fontFamily: 'system-ui' },
  sidebar: { width: '300px', borderRight: '1px solid #222', display: 'flex', flexDirection: 'column', padding: '15px' },
  brand: { display: 'flex', alignItems: 'center', gap: '10px', fontSize: '20px', marginBottom: '20px' },
  searchBox: { display: 'flex', background: '#1a1a1a', borderRadius: '8px', padding: '5px' },
  searchInput: { flex: 1, background: 'transparent', border: 'none', color: '#fff', padding: '8px', outline: 'none' },
  searchBtn: { background: 'transparent', border: 'none', color: '#1DB954', cursor: 'pointer' },
  resultsList: { flex: 1, overflowY: 'auto', marginTop: '15px' },
  songCard: { display: 'flex', gap: '10px', padding: '10px', borderRadius: '8px', cursor: 'pointer', marginBottom: '5px', background: '#0a0a0a' },
  thumb: { width: '60px', borderRadius: '4px' },
  songTitle: { fontSize: '13px', fontWeight: 'bold' },
  playTag: { fontSize: '10px', color: '#1DB954', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' },
  main: { flex: 1, display: 'flex', flexDirection: 'column' },
  header: { padding: '15px', background: '#0a0a0a', borderBottom: '1px solid #222' },
  roomBadge: { background: '#222', width: 'fit-content', padding: '5px 12px', borderRadius: '20px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' },
  videoArea: { background: '#000', padding: '10px' },
  chatArea: { flex: 1, display: 'flex', flexDirection: 'column', padding: '15px', background: '#050505' },
  chatHeader: { paddingBottom: '10px', borderBottom: '1px solid #222', fontSize: '14px', color: '#888', display: 'flex', alignItems: 'center', gap: '8px' },
  messages: { flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px 0' },
  msgBubble: { background: '#1DB954', color: '#fff', padding: '8px 15px', borderRadius: '15px', alignSelf: 'flex-start', fontSize: '14px' },
  chatInputRow: { display: 'flex', gap: '10px', marginTop: '10px' },
  chatInput: { flex: 1, background: '#1a1a1a', border: 'none', borderRadius: '20px', padding: '10px 15px', color: '#fff', outline: 'none' },
  sendBtn: { background: '#1DB954', border: 'none', width: '40px', height: '40px', borderRadius: '50%', color: '#fff', cursor: 'pointer' },
  loginPage: { height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' },
  loginCard: { background: '#0a0a0a', padding: '40px', borderRadius: '24px', border: '1px solid #222', textAlign: 'center', width: '320px' },
  logoCircle: { width: '80px', height: '80px', borderRadius: '50%', background: '#1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' },
  loginInput: { width: '100%', padding: '12px', background: '#000', border: '1px solid #333', color: '#fff', borderRadius: '10px', marginBottom: '15px', boxSizing: 'border-box' },
  loginBtn: { width: '100%', padding: '12px', background: '#1DB954', color: '#fff', border: 'none', borderRadius: '30px', fontWeight: 'bold', cursor: 'pointer' }
};