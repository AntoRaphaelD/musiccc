import React, { useState, useEffect, useRef, useCallback } from 'react';
import YouTube from 'react-youtube';
import { initializeApp } from 'firebase/app';
import { 
  getDatabase, ref, onValue, set, push, remove, 
  limitToLast, query as fbQuery, onDisconnect 
} from 'firebase/database';
import { 
  Search, Play, Users, Send, MessageSquare, 
  Rocket, ShieldCheck, Stars, Orbit, Zap, Radio, Bell, 
  Disc, History, Power, GripHorizontal, GripVertical, ChevronUp, ChevronDown, 
  UserCheck, Globe, Moon, Reply, X, AtSign, ChevronLeft, ChevronRight
} from 'lucide-react';

// --- CONFIGURATION ---
const firebaseConfig = {
  apiKey: "AIzaSyDUIIsT9yYQGcQgYpolTAoYvjsy_cssKlQ",
  authDomain: "watch-party-65807.firebaseapp.com",
  projectId: "watch-party-65807",
  storageBucket: "watch-party-65807.firebasestorage.app",
  messagingSenderId: "969287261247",
  appId: "1:969287261247:web:1fe057a70644c16892ac8a",
  databaseURL: "https://watch-party-65807-default-rtdb.asia-southeast1.firebasedatabase.app"
};

const YT_API_KEY = "AIzaSyBIjyXvo--T-3u7T0ooF1BQiJQm8uDNqJY";

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

export default function App() {
  const [username, setUsername] = useState("");
  const [room, setRoom] = useState("");
  const [joined, setJoined] = useState(false);
  const [requestStatus, setRequestStatus] = useState("idle");
  const [adminRequests, setAdminRequests] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [videoId, setVideoId] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [personalPlaylist, setPersonalPlaylist] = useState([]);
  const [chat, setChat] = useState([]);
  const [msgInput, setMsgInput] = useState("");
  
  // --- LAYOUT STATE ---
  const [bottomHeight, setBottomHeight] = useState(300); 
  const [chatWidth, setChatWidth] = useState(400); 
  const isResizingH = useRef(false);
  const isResizingV = useRef(false);

  // --- CHAT FEATURES STATE ---
  const [replyTo, setReplyTo] = useState(null);
  const [showMentions, setShowMentions] = useState(false);

  const playerRef = useRef(null);
  const isPlayerReady = useRef(false);
  const isIncomingSync = useRef(false);
  const chatEndRef = useRef(null);
  const isAdmin = username.trim() === "AntoRafel";

  // --- RESIZER LOGIC ---
  const startResizingH = () => { isResizingH.current = true; document.body.style.cursor = 'row-resize'; };
  const startResizingV = () => { isResizingV.current = true; document.body.style.cursor = 'col-resize'; };

  const stopResizing = useCallback(() => {
    isResizingH.current = false;
    isResizingV.current = false;
    document.body.style.cursor = 'default';
  }, []);

  const onMouseMove = useCallback((e) => {
    if (isResizingH.current) {
      const newHeight = window.innerHeight - e.clientY - 40;
      if (newHeight > 100 && newHeight < window.innerHeight - 250) setBottomHeight(newHeight);
    }
    if (isResizingV.current) {
      const newWidth = window.innerWidth - e.clientX - 20;
      if (newWidth > 300 && newWidth < window.innerWidth - 600) setChatWidth(newWidth);
    }
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', stopResizing);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', stopResizing);
    };
  }, [onMouseMove, stopResizing]);

  // --- CORE FUNCTIONS ---
  const handleJoinRequest = () => {
    if (!username || !room) return alert("Identify yourself, Astronaut!");
    if (isAdmin) {
      setJoined(true);
    } else {
      setRequestStatus('pending');
      set(ref(db, `rooms/${room}/requests/${username}`), { username, status: 'pending' });
    }
  };

  const handleExit = () => {
    if (room && username) remove(ref(db, `rooms/${room}/participants/${username}`));
    setJoined(false);
    setRequestStatus("idle");
    setRoom("");
    setVideoId("");
  };

  const playSong = (vId, title, thumb) => {
    setVideoId(vId);
    isPlayerReady.current = false;
    // Broadcast to room
    set(ref(db, `rooms/${room}/state`), { action: 'play', time: 0, videoId: vId });
    // Save to Mission Logs (Personal History) - vId as key prevents repeats
    set(ref(db, `users/${username}/playlist/${vId}`), { 
      videoId: vId, 
      title, 
      thumb, 
      timestamp: Date.now() 
    });
    setSearchResults([]);
    setSearchTerm("");
  };

  const broadcast = (action) => {
    if (isIncomingSync.current || !videoId || !joined) return;
    runSafeAction(async (player) => {
      const time = await player.getCurrentTime();
      set(ref(db, `rooms/${room}/state`), { action, time, videoId });
    });
  };

  const sendChatMessage = () => {
    if (!msgInput.trim() || !room) return;
    const messageData = {
      text: msgInput,
      sender: username,
      time: Date.now(),
      replyTo: replyTo ? { sender: replyTo.sender, text: replyTo.text } : null
    };
    push(ref(db, `rooms/${room}/chat`), messageData);
    setMsgInput("");
    setReplyTo(null);
    setShowMentions(false);
  };

  const handleInputChange = (e) => {
    const value = e.target.value;
    setMsgInput(value);
    if (value.endsWith('@')) setShowMentions(true);
    else if (value.endsWith(' ') || value === "") setShowMentions(false);
  };

  const insertMention = (targetUser) => {
    const baseText = msgInput.endsWith('@') ? msgInput.slice(0, -1) : msgInput;
    setMsgInput(`${baseText}@${targetUser} `);
    setShowMentions(false);
  };

  const runSafeAction = async (callback) => {
    try {
      const internal = await playerRef.current.getInternalPlayer();
      if (internal) await callback(internal);
    } catch (e) { console.warn("Sync blocked"); }
  };

  const searchSongs = async () => {
    if (!searchTerm.trim()) return;
    try {
      const res = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=15&q=${encodeURIComponent(searchTerm)}&type=video&key=${YT_API_KEY}`);
      const data = await res.json();
      setSearchResults(data.items || []);
    } catch (e) { console.error("YouTube scan failed"); }
  };

  // --- FIREBASE SYNC ---
  useEffect(() => {
    if (!joined || !room) return;

    const myPartRef = ref(db, `rooms/${room}/participants/${username}`);
    set(myPartRef, { username, active: true });
    onDisconnect(myPartRef).remove();

    onValue(ref(db, `rooms/${room}/participants`), (snap) => {
      setParticipants(snap.val() ? Object.values(snap.val()) : []);
    });

    onValue(ref(db, `rooms/${room}/state`), (snapshot) => {
      const data = snapshot.val();
      if (!data) return;
      if (data.videoId !== videoId) setVideoId(data.videoId);
      if (playerRef.current && isPlayerReady.current) {
        runSafeAction(async (player) => {
          isIncomingSync.current = true;
          const state = await player.getPlayerState();
          if (data.action === 'play' && state !== 1) player.playVideo();
          if (data.action === 'pause' && state !== 2) player.pauseVideo();
          const currentTime = await player.getCurrentTime();
          if (Math.abs(data.time - currentTime) > 2) player.seekTo(data.time, true);
          setTimeout(() => isIncomingSync.current = false, 1200);
        });
      }
    });

    onValue(ref(db, `users/${username}/playlist`), (snap) => {
      if (snap.val()) {
        const list = Object.values(snap.val()).sort((a, b) => b.timestamp - a.timestamp);
        setPersonalPlaylist(list);
      }
    });

    onValue(fbQuery(ref(db, `rooms/${room}/chat`), limitToLast(50)), (snap) => {
      setChat(snap.val() ? Object.values(snap.val()) : []);
    });

    if (isAdmin) {
      onValue(ref(db, `rooms/${room}/requests`), (snap) => {
        setAdminRequests(snap.val() ? Object.entries(snap.val()).map(([id, v]) => ({ id, ...v })) : []);
      });
    }
  }, [joined, room, username, videoId]);

  useEffect(() => {
    if (!isAdmin && requestStatus === 'pending') {
      const unsub = onValue(ref(db, `rooms/${room}/requests/${username}`), (snap) => {
        if (snap.val()?.status === 'approved') setJoined(true);
      });
      return () => unsub();
    }
  }, [requestStatus, isAdmin, room, username]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chat]);

  // --- UI COMPONENTS ---
  const SpaceBackground = () => (
    <div className="space-env">
      <div className="star-layer" />
      <div className="nebula-cloud cloud-1" />
      <div className="nebula-cloud cloud-2" />
      <div className="cartoon-earth" />
      <div className="cartoon-moon" />
      <div className="cartoon-astro" />
    </div>
  );

  if (!joined) {
    return (
      <div className="se-root">
        <SpaceBackground />
        <div className="login-wrap">
          <div className="login-card">
            <div className="card-top">
              <div className="win-btns"><span/><span/><span/></div>
              <span>ORBITAL_AUTH.SYS</span>
            </div>
            <div className="card-content">
              <div className="rocket-box"><Rocket size={40} className="rocket-icon"/></div>
              <h1>SYNC<span>EAR</span></h1>
              {requestStatus === 'pending' ? (
                <div className="pending-zone">
                  <Radio size={36} className="pulse-icon yellow-text"/>
                  <h3>AWAITING DOCKING CLEARANCE</h3>
                  <p>Request sent to Commander AntoRafel.</p>
                  <button onClick={handleExit} className="btn-abort">ABORT MISSION</button>
                </div>
              ) : (
                <div className="login-form">
                  <div className="f-group"><label>PILOT CALLSIGN</label><input value={username} onChange={e=>setUsername(e.target.value)} placeholder="Username..."/></div>
                  <div className="f-group"><label>TARGET SECTOR</label><input value={room} onChange={e=>setRoom(e.target.value.toLowerCase())} placeholder="Room ID..."/></div>
                  <button onClick={handleJoinRequest} className="btn-launch">INITIATE LAUNCH</button>
                </div>
              )}
            </div>
          </div>
        </div>
        <Styles />
      </div>
    );
  }

  return (
    <div className="se-root">
      <SpaceBackground />
      <div className="app-shell">
        <header className="top-nav">
          <div className="nav-left">
            <div className="logo-sq"><Disc className="spin-slow" size={24}/></div>
            <div className="logo-text">SYNC<span>EAR</span></div>
            <div className="room-pill pulse">SECTOR: {room.toUpperCase()}</div>
          </div>
          <div className="nav-search">
            <Search size={18} className="search-ico" />
            <input placeholder="Scan frequencies..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} onKeyPress={e => e.key === 'Enter' && searchSongs()}/>
            <button onClick={searchSongs}><Zap size={16} /></button>
          </div>
          <div className="nav-right">
            <div className="user-chip"><div className="u-ava">{username.charAt(0)}</div><span>{username}</span></div>
            <button className="exit-btn" onClick={handleExit}><Power size={18} /></button>
          </div>
        </header>

        <main className="main-layout" style={{ gridTemplateColumns: `260px 1fr 12px ${chatWidth}px` }}>
          {/* LEFT: CREW */}
          <aside className="panel crew-panel">
            {isAdmin && adminRequests.some(r => r.status === 'pending') && (
              <div className="admin-requests-panel">
                <div className="p-head warning-head"><Bell size={14}/> DOCKING ALERTS</div>
                <div className="req-list">
                  {adminRequests.filter(r => r.status === 'pending').map(req => (
                    <div key={req.id} className="req-card">
                      <div className="req-info"><b>{req.username}</b><span>WANTS ACCESS</span></div>
                      <button onClick={() => set(ref(db, `rooms/${room}/requests/${req.id}/status`), 'approved')}><UserCheck size={14}/> GRANT</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="p-head"><Users size={14}/> CREW MANIFEST</div>
            <div className="p-body">
              {participants.map((p, i) => (
                <div key={i} className="crew-item" onClick={() => insertMention(p.username)}>
                  <div className="c-ava">{p.username.charAt(0)}</div>
                  <div className="c-info"><b>{p.username}</b></div>
                  {p.username === 'AntoRafel' && <ShieldCheck size={14} className="c-cmd"/>}
                </div>
              ))}
            </div>
          </aside>

          {/* CENTER: PLAYER & MISSION LOGS */}
          <section className="center-panel">
            <div className="player-section">
              <div className="video-container">
                <div className="v-overlay"><span className="v-live pulse">REC ● LIVE</span><span className="v-status">SYNC_STABLE</span></div>
                {videoId ? (
                  <YouTube videoId={videoId} ref={playerRef} onReady={() => isPlayerReady.current = true} onPlay={() => broadcast('play')} onPause={() => broadcast('pause')} opts={{ width: '100%', height: '100%', playerVars: { autoplay: 1, controls: 1 } }} className="yt-iframe" />
                ) : (
                  <div className="no-vid"><Orbit size={60} className="spin-slow" /><h2>NO SIGNAL</h2><p>Commander, initiate a scan to start streaming</p></div>
                )}
              </div>
            </div>

            <div className="dimension-adjuster horizontal" onMouseDown={startResizingH}>
              <div className="adjuster-handle"><ChevronUp size={12}/> <GripHorizontal size={20}/> <ChevronDown size={12}/></div>
              <div className="adjuster-label">VERTICAL SYNC ADJUSTER</div>
            </div>

            <div className="results-section" style={{ height: `${bottomHeight}px` }}>
              <div className="p-head">
                {searchResults.length > 0 ? <><Search size={14}/> SCANNER RESULTS</> : <><History size={14}/> MISSION LOGS (UNIQUE)</>}
              </div>
              <div className="track-scroll"><div className="track-grid">
                {(searchResults.length > 0 ? searchResults : personalPlaylist).map((song, i) => {
                  const id = song.id?.videoId || song.videoId;
                  const title = song.snippet?.title || song.title;
                  const thumb = song.snippet?.thumbnails?.high?.url || song.thumb;
                  return (
                    <div key={id + i} className="track-item" onClick={() => playSong(id, title, thumb)}>
                      <div className="t-thumb"><img src={thumb} alt="" /><div className="t-play"><Play fill="white"/></div></div>
                      <div className="t-meta"><p>{title}</p><span>{searchResults.length > 0 ? "SCAN_FOUND" : "LOG_SAVED"}</span></div>
                    </div>
                  );
                })}
              </div></div>
            </div>
          </section>

          {/* VERTICAL ADJUSTER */}
          <div className="dimension-adjuster vertical" onMouseDown={startResizingV}>
            <div className="adjuster-handle-v"><ChevronLeft size={10}/> <GripVertical size={16}/> <ChevronRight size={10}/></div>
          </div>

          {/* RIGHT: CHAT HUB */}
          <aside className="panel chat-panel">
            <div className="p-head"><MessageSquare size={14}/> COMMS HUB</div>
            
            <div className="chat-body">
              {chat.map((m, i) => (
                <div key={i} className={`msg-group ${m.sender === username ? 'me' : 'them'}`}>
                  <div className="msg-bubble-wrap">
                    <div className="msg-bubble">
                      <div className="msg-from">{m.sender.toUpperCase()}</div>
                      {m.replyTo && <div className="quoted-msg"><b>{m.replyTo.sender}</b><p>{m.replyTo.text}</p></div>}
                      <div className="msg-text">
                        {m.text.split(/(@\w+)/g).map((part, i) => 
                          part.startsWith('@') ? <span key={i} className="mention-tag">{part}</span> : part
                        )}
                      </div>
                      <button className="reply-btn" onClick={() => setReplyTo(m)}><Reply size={14} /></button>
                    </div>
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            {showMentions && (
              <div className="mention-suggestions">
                <div className="mention-head"><AtSign size={12}/> SELECT PILOT</div>
                {participants.map((p, idx) => (
                  <div key={idx} className="mention-item" onClick={() => insertMention(p.username)}>
                    <div className="m-ava">{p.username.charAt(0)}</div><span>{p.username}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="chat-footer">
              {replyTo && (
                <div className="reply-preview">
                  <div className="reply-bar" />
                  <div className="reply-content"><b>Replying to {replyTo.sender}</b><p>{replyTo.text}</p></div>
                  <button onClick={() => setReplyTo(null)} className="cancel-reply"><X size={14}/></button>
                </div>
              )}
              
              <div className="chat-input-row">
                <input 
                  className="realtime-input"
                  placeholder="Broadcast signal..." 
                  value={msgInput} 
                  onChange={handleInputChange}
                  onKeyPress={e=>e.key==='Enter' && sendChatMessage()}
                />
                <button onClick={sendChatMessage} className="send-btn"><Send size={18}/></button>
              </div>
            </div>
          </aside>
        </main>
      </div>
      <Styles />
    </div>
  );
}

function Styles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Fredoka:wght@400;600&family=Space+Grotesk:wght@300;500;700&display=swap');

      :root {
        --bg: #03040a;
        --white: #ffffff;
        --accent: #3b82f6;
        --yellow: #ffcf4d;
        --border: 3px solid #000000;
      }

      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { background: var(--bg); color: var(--white); font-family: 'Space Grotesk', sans-serif; overflow: hidden; }

      .space-env { position: fixed; inset: 0; z-index: -1; background: radial-gradient(circle at 50% 50%, #111827 0%, #03040a 100%); }
      .star-layer { position: absolute; inset: 0; background-image: radial-gradient(white 1px, transparent 1px); background-size: 40px 40px; opacity: 0.1; }
      .nebula-cloud { position: absolute; width: 500px; height: 500px; border-radius: 50%; filter: blur(80px); opacity: 0.1; }
      .cloud-1 { background: #4f46e5; top: -10%; left: -5%; animation: drift 15s infinite alternate; }
      .cloud-2 { background: #9333ea; bottom: -10%; right: -5%; animation: drift 20s infinite alternate-reverse; }

      .cartoon-earth {
        position: absolute; width: 100px; height: 100px; border-radius: 50%; border: var(--border);
        background: #3b82f6; top: 15%; right: 15%; animation: float 12s infinite ease-in-out;
        box-shadow: inset -15px -15px 0 rgba(0,0,0,0.2);
        background-image: radial-gradient(circle at 30% 30%, #4ade80 20px, transparent 20px), radial-gradient(circle at 70% 60%, #4ade80 25px, transparent 25px);
      }
      .cartoon-moon {
        position: absolute; width: 30px; height: 30px; border-radius: 50%; border: 2px solid #000;
        background: #cbd5e1; top: 22%; right: 25%; animation: orbit 20s infinite linear;
      }
      .cartoon-astro { 
        position: absolute; width: 120px; height: 120px; background: url('https://cdn-icons-png.flaticon.com/512/2026/2026462.png') center/contain no-repeat;
        bottom: 10%; right: 5%; animation: float 18s infinite linear; 
      }

      @keyframes orbit { from { transform: rotate(0deg) translateX(80px); } to { transform: rotate(360deg) translateX(80px); } }
      @keyframes float { 0%,100% { transform: translateY(0) rotate(0); } 50% { transform: translateY(-30px) rotate(8deg); } }
      @keyframes drift { from { transform: translate(0,0); } to { transform: translate(40px, 40px); } }
      .spin-slow { animation: spin 12s linear infinite; }
      .pulse { animation: pulse 2s infinite; }
      @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }

      .login-wrap { height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
      .login-card { background: #fff; color: #000; width: 100%; max-width: 400px; border: var(--border); border-radius: 18px; box-shadow: 10px 10px 0 #000; overflow: hidden; }
      .card-top { background: #e2e8f0; padding: 10px 15px; border-bottom: var(--border); font-family: monospace; font-size: 11px; font-weight: bold; }
      .win-btns { display: flex; gap: 5px; margin-right: 10px; float: left; }
      .win-btns span { width: 10px; height: 10px; border-radius: 50%; border: 1.5px solid #000; display: inline-block; }
      .win-btns span:nth-child(1) { background: #ff5f56; }
      .win-btns span:nth-child(2) { background: #ffbd2e; }
      .win-btns span:nth-child(3) { background: #27c93f; }
      .card-content { padding: 40px 30px; text-align: center; }
      .rocket-box { width: 80px; height: 80px; background: var(--yellow); border: var(--border); border-radius: 50%; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center; box-shadow: 4px 4px 0 #000; }
      .card-content h1 { font-family: 'Fredoka'; font-size: 42px; margin-bottom: 25px; }
      .card-content h1 span { color: var(--accent); }
      .f-group { text-align: left; margin-bottom: 15px; }
      .f-group label { display: block; font-size: 10px; font-weight: 800; margin-bottom: 4px; }
      .f-group input { width: 100%; padding: 12px; border: var(--border); border-radius: 12px; font-size: 15px; }
      .btn-launch { width: 100%; padding: 15px; background: var(--accent); color: #fff; border: var(--border); border-radius: 12px; font-family: 'Fredoka'; font-size: 18px; cursor: pointer; box-shadow: 4px 4px 0 #000; }

      .app-shell { height: 100vh; display: flex; flex-direction: column; }
      .top-nav { height: 70px; background: rgba(0,0,0,0.9); border-bottom: var(--border); display: flex; align-items: center; padding: 0 20px; gap: 20px; z-index: 100; }
      .nav-left { display: flex; align-items: center; gap: 12px; min-width: 250px; }
      .logo-sq { width: 40px; height: 40px; background: var(--white); border: var(--border); border-radius: 10px; display: flex; align-items: center; justify-content: center; color: #000; }
      .logo-text { font-family: 'Fredoka'; font-size: 22px; }
      .logo-text span { color: var(--yellow); }
      .nav-search { flex: 1; max-width: 500px; height: 45px; background: #fff; border: var(--border); border-radius: 50px; display: flex; align-items: center; padding: 0 5px 0 15px; box-shadow: 4px 4px 0 var(--accent); }
      .nav-search input { flex: 1; border: none; outline: none; padding: 0 10px; color: #000; font-family: inherit; }
      .nav-search button { width: 36px; height: 36px; background: var(--yellow); border: var(--border); border-radius: 50%; cursor: pointer; }

      .nav-right {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 250px;
  justify-content: flex-end;
}

.user-chip {
  display: flex;
  align-items: center;
  gap: 10px;
  background: #fff;
  color: #000;
  padding: 6px 14px;
  height: 40px;
  border: var(--border);
  border-radius: 50px;
}

.exit-btn {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: var(--border);
  border-radius: 10px;
  background: #ef4444;
  color: #fff;
  cursor: pointer;
}
      .user-chip { display: flex; align-items: center; gap: 10px; background: #fff; color: #000; padding: 5px 12px 5px 6px; border: var(--border); border-radius: 50px; }
      .u-ava { width: 30px; height: 30px; background: var(--accent); border: 2px solid #000; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #fff; font-weight: bold; }
      .exit-btn { width: 40px; height: 40px; border: var(--border); border-radius: 10px; background: #ef4444; color: #fff; cursor: pointer; }

      .main-layout { flex: 1; display: grid; gap: 0; padding: 15px; overflow: hidden; }
      .panel { background: rgba(255,255,255,0.05); border: var(--border); border-radius: 18px; display: flex; flex-direction: column; overflow: hidden; height: 100%; }
      .p-head { background: #000; padding: 10px 15px; font-size: 11px; font-weight: 700; display: flex; align-items: center; gap: 8px; font-family: monospace; }
      
      .admin-requests-panel { background: #fff; color: #000; border-bottom: var(--border); }
      .warning-head { background: #ef4444 !important; color: #fff; }
      .req-list { padding: 10px; display: flex; flex-direction: column; gap: 8px; }
      .req-card { background: #f1f5f9; border: 2px solid #000; padding: 8px; border-radius: 10px; display: flex; align-items: center; justify-content: space-between; }
      .req-card button { background: #22c55e; color: #fff; border: 2px solid #000; padding: 5px 10px; border-radius: 5px; font-size: 10px; cursor: pointer; }

      .p-body { padding: 15px; flex: 1; overflow-y: auto; }
      .crew-item { background: #fff; color: #000; padding: 10px; border: var(--border); border-radius: 12px; display: flex; align-items: center; gap: 10px; margin-bottom: 10px; cursor: pointer; }
      .c-ava { width: 35px; height: 35px; background: var(--yellow); border: 2px solid #000; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-weight: 900; }
      .c-cmd { margin-left: auto; color: var(--accent); }

      .center-panel { display: flex; flex-direction: column; min-height: 0; padding: 0 15px; }
      .player-section { background: #000; border: var(--border); border-radius: 18px; overflow: hidden; flex: 1; min-height: 0; }
      .video-container { position: relative; width: 100%; height: 100%; }
      .yt-iframe { position: absolute; top: 0; left: 0; width: 100% !important; height: 100% !important; }
      .v-overlay { position: absolute; top: 15px; left: 15px; right: 15px; display: flex; justify-content: space-between; z-index: 5; }
      .v-live { background: #ef4444; padding: 3px 8px; border-radius: 4px; font-size: 9px; font-weight: bold; border: 1.5px solid #000; }
      .v-status { font-family: monospace; font-size: 10px; color: #4ade80; text-shadow: 2px 2px 0 #000; }

      .dimension-adjuster.horizontal { height: 34px; background: var(--yellow); border: var(--border); margin: 10px 0; border-radius: 10px; cursor: row-resize; display: flex; align-items: center; justify-content: center; box-shadow: 4px 4px 0 #000; }
      .dimension-adjuster.vertical { width: 12px; cursor: col-resize; display: flex; align-items: center; justify-content: center; }
      .adjuster-handle-v { background: var(--yellow); border: 2px solid #000; border-radius: 4px; padding: 10px 0; display: flex; flex-direction: column; align-items: center; gap: 4px; color: #000; z-index: 50; }

      .results-section { background: rgba(255,255,255,0.05); border: var(--border); border-radius: 18px; display: flex; flex-direction: column; overflow: hidden; }
      .track-scroll { flex: 1; overflow-y: auto; padding: 15px; }
      .track-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 15px; }
      .track-item { background: #fff; color: #000; border: var(--border); border-radius: 12px; overflow: hidden; cursor: pointer; box-shadow: 4px 4px 0 #000; transition: 0.15s; }
      .track-item:hover { transform: translateY(-4px); box-shadow: 6px 6px 0 var(--accent); }
      .t-thumb { position: relative; aspect-ratio: 16/9; border-bottom: var(--border); }
      .t-thumb img { width: 100%; height: 100%; object-fit: cover; }
      .t-play { position: absolute; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; opacity: 0; }
      .track-item:hover .t-play { opacity: 1; }
      .t-meta { padding: 8px; }
      .t-meta p { font-size: 11px; font-weight: 700; height: 2.6em; overflow: hidden; }

      .chat-panel { background: rgba(255,255,255,0.1); display: flex; flex-direction: column; }
      .chat-body { flex: 1; overflow-y: auto; padding: 15px; display: flex; flex-direction: column; gap: 15px; }
      .msg-group { display: flex; flex-direction: column; max-width: 90%; position: relative; }
      .me { align-self: flex-end; }
      .them { align-self: flex-start; }
      .msg-bubble { background: #fff; color: #000; padding: 10px 14px; border: var(--border); border-radius: 15px; box-shadow: 4px 4px 0 #000; position: relative; }
      .me .msg-bubble { background: var(--yellow); box-shadow: -4px 4px 0 #000; }
      .msg-from { font-size: 8px; font-weight: 900; opacity: 0.6; font-family: monospace; margin-bottom: 2px; }
      .msg-text { font-size: 14px; line-height: 1.3; }
      .mention-tag { background: var(--accent); color: #fff; padding: 1px 4px; border-radius: 4px; font-weight: bold; border: 1px solid #000; }
      .quoted-msg { background: rgba(0,0,0,0.05); border-left: 3px solid var(--accent); padding: 4px 8px; border-radius: 4px; margin-bottom: 5px; font-size: 11px; }
      .reply-btn { position: absolute; right: -30px; top: 50%; transform: translateY(-50%); opacity: 0; color: #fff; cursor: pointer; transition: 0.2s; border: none; background: none; }
      .msg-group:hover .reply-btn { opacity: 1; }

      .mention-suggestions { background: #fff; color: #000; border: var(--border); border-radius: 12px; margin: 0 10px; box-shadow: 0 -10px 30px rgba(0,0,0,0.5); z-index: 100; }
      .mention-head { background: #000; color: #fff; padding: 5px 10px; font-size: 9px; }
      .mention-item { padding: 10px; display: flex; align-items: center; gap: 10px; cursor: pointer; border-bottom: 1px solid #eee; }
      .mention-item:hover { background: #f0f9ff; }

      .chat-footer { background: #f8fafc; border-top: var(--border); padding: 15px; z-index: 10; }
      .reply-preview { background: #e2e8f0; border: 2px solid #000; border-radius: 8px; margin-bottom: 8px; padding: 6px; display: flex; position: relative; color: #000; }
      .reply-bar { width: 4px; background: var(--accent); border-radius: 4px; margin-right: 10px; }
      .reply-content { flex: 1; font-size: 11px; overflow: hidden; }
      .chat-input-row { display: flex; gap: 10px; align-items: center; }
      .realtime-input { flex: 1; padding: 12px 15px; border: var(--border); border-radius: 12px; font-family: inherit; font-size: 14px; color: #000 !important; background: #fff !important; }
      .send-btn { width: 48px; height: 48px; background: var(--accent); border: var(--border); border-radius: 12px; cursor: pointer; color: #fff; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }

      ::-webkit-scrollbar { width: 10px; }
      ::-webkit-scrollbar-thumb { background: #000; border: 2px solid #fff; border-radius: 10px; }
    `}</style>
  );
}
