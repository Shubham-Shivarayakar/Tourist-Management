// ── Tourist Safety Chatbot ────────────────────────────────────────────────────

const BOT_KB = [
  {
    keys: ['sos','emergency','help','danger','panic','alert'],
    reply: `🆘 <b>SOS Emergency</b><br>
    Press the big red <b>SOS button</b> on your dashboard or say <i>"help me"</i> to trigger voice SOS.<br><br>
    This will:<br>
    • Alert the admin immediately<br>
    • Notify your emergency contacts<br>
    • Mark your location on the map`
  },
  {
    keys: ['location','track','gps','map','where'],
    reply: `📍 <b>Location Tracking</b><br>
    Go to <b>🗺️ Live Map</b> in the sidebar and click <b>▶ Start Tracking</b>.<br><br>
    Your location updates every 15 seconds and is visible to the admin panel in real time.`
  },
  {
    keys: ['contact','contacts','emergency contact','notify','phone','family'],
    reply: `📞 <b>Emergency Contacts</b><br>
    Go to <b>📞 Emergency Contacts</b> in the sidebar to add contacts.<br><br>
    When you press SOS, all saved contacts are automatically notified with your location.`
  },
  {
    keys: ['weather','rain','storm','flood','temperature','forecast','climate'],
    reply: `🌤️ <b>Weather Alerts</b><br>
    Go to <b>🌤️ Weather Alerts</b> in the sidebar to see current conditions.<br><br>
    The system shows:<br>
    • Temperature & humidity<br>
    • Storm / flood warnings<br>
    • Safety recommendations based on weather`
  },
  {
    keys: ['voice','speak','microphone','mic','say','speech'],
    reply: `🎙️ <b>Voice SOS</b><br>
    On the dashboard, click <b>🎙️ Start Voice Detection</b>.<br><br>
    Say <b>"help me"</b>, <b>"SOS"</b>, or <b>"emergency"</b> and the system will automatically trigger an alert.<br><br>
    Works best in Chrome or Edge browsers.`
  },
  {
    keys: ['register','signup','sign up','create account','new account'],
    reply: `✅ <b>How to Register</b><br>
    1. Go to the login page<br>
    2. Click the <b>Register</b> tab<br>
    3. Enter your name, email and password<br>
    4. Click <b>Send OTP</b> — check your email<br>
    5. Enter the OTP to verify and create your account`
  },
  {
    keys: ['login','sign in','otp','verify','verification','password'],
    reply: `🔐 <b>How to Login</b><br>
    1. Enter your email and password<br>
    2. Click <b>Send OTP</b><br>
    3. Check your email for a 6-digit code<br>
    4. Enter the OTP to complete login<br><br>
    <i>Tip: If email isn't configured, the OTP shows on screen in an orange box.</i>`
  },
  {
    keys: ['safe','safety','tips','advice','precaution','rules'],
    reply: `⚠️ <b>Safety Tips</b><br>
    • Always share your itinerary with someone<br>
    • Keep emergency contacts saved in the app<br>
    • Enable location tracking when exploring<br>
    • Avoid isolated areas after dark<br>
    • Know local emergency numbers:<br>
    &nbsp;&nbsp;Police: <b>100</b> | Ambulance: <b>108</b> | Tourist Helpline: <b>1363</b>`
  },
  {
    keys: ['camera','cctv','surveillance','monitor','watch'],
    reply: `📹 <b>Surveillance System</b><br>
    The admin panel monitors CCTV cameras across tourist zones.<br><br>
    If suspicious activity is detected near your location, an automatic alert is sent to authorities.`
  },
  {
    keys: ['admin','dashboard','panel','authority','police'],
    reply: `👨‍💻 <b>Admin Panel</b><br>
    Authorities monitor the system at <b>/admin</b>.<br><br>
    They can see:<br>
    • All SOS alerts in real time<br>
    • Your live location on the map<br>
    • CCTV incident reports<br>
    • Tourist activity overview`
  },
  {
    keys: ['hi','hello','hey','hii','helo','greet','good morning','good evening'],
    reply: `👋 <b>Hello! I'm SafeBot</b> 🛡️<br><br>
    I'm here to help you stay safe. You can ask me about:<br>
    • 🆘 SOS & emergencies<br>
    • 📍 Location tracking<br>
    • 📞 Emergency contacts<br>
    • 🌤️ Weather alerts<br>
    • 🎙️ Voice SOS<br>
    • ⚠️ Safety tips<br><br>
    What do you need help with?`
  },
  {
    keys: ['thank','thanks','ok','okay','great','good','nice','perfect','awesome'],
    reply: `😊 You're welcome! Stay safe out there.<br>
    Remember — if you're ever in danger, press the <b>🆘 SOS button</b> immediately.`
  },
  {
    keys: ['bye','goodbye','exit','quit','close'],
    reply: `👋 Stay safe! The chatbot is always here if you need help. 🛡️`
  },
  {
    keys: ['plan','trip','itinerary','tour','travel','destination','visit','go'],
    reply: `🗺️ <b>Trip Planner</b><br>
    Go to <b>🗺️ Trip Planner</b> in the sidebar!<br><br>
    You can:<br>
    • Enter destination, dates & budget<br>
    • Select preferences (adventure, food, culture...)<br>
    • Get a day-wise AI itinerary instantly<br>
    • Chat with the AI Tour Guide for recommendations<br>
    • Save and manage multiple trips`
  },
  {
    keys: ['how','what','guide','use','using','feature','work','works'],
    reply: `📖 <b>Quick Guide</b><br><br>
    <b>🏠 Dashboard</b> — SOS button + voice detection<br>
    <b>🗺️ Live Map</b> — real-time GPS tracking<br>
    <b>📞 Contacts</b> — add people to notify on SOS<br>
    <b>🌤️ Weather</b> — environmental safety alerts<br>
    <b>🚨 My Alerts</b> — history of your SOS alerts<br>
    <b>⚠️ Safety Tips</b> — travel safety guidelines`
  }
];

function getBotReply(input) {
  const text = input.toLowerCase().trim();
  for (const entry of BOT_KB) {
    if (entry.keys.some(k => text.includes(k))) return entry.reply;
  }
  return `🤔 I'm not sure about that. Try asking about:<br>
  <span style="color:#1a73e8;cursor:pointer" onclick="chatSend('SOS emergency')">SOS emergency</span> &nbsp;|&nbsp;
  <span style="color:#1a73e8;cursor:pointer" onclick="chatSend('location tracking')">location tracking</span> &nbsp;|&nbsp;
  <span style="color:#1a73e8;cursor:pointer" onclick="chatSend('safety tips')">safety tips</span> &nbsp;|&nbsp;
  <span style="color:#1a73e8;cursor:pointer" onclick="chatSend('emergency contacts')">emergency contacts</span>`;
}

// ── UI ────────────────────────────────────────────────────────────────────────

function buildChatbot() {
  const el = document.createElement('div');
  el.id = 'chatbot-root';
  el.innerHTML = `
  <style>
    #chatbot-root * { box-sizing:border-box; }
    #chat-fab {
      position:fixed; bottom:1.5rem; right:1.5rem; z-index:1000;
      width:58px; height:58px; border-radius:50%;
      background:linear-gradient(135deg,#1a73e8,#0d47a1);
      color:#fff; border:none; cursor:pointer; font-size:1.6rem;
      box-shadow:0 4px 20px rgba(26,115,232,0.5);
      display:flex; align-items:center; justify-content:center;
      transition:transform 0.2s;
    }
    #chat-fab:hover { transform:scale(1.1); }
    #chat-fab .notif-dot {
      position:absolute; top:4px; right:4px;
      width:12px; height:12px; background:#e53935;
      border-radius:50%; border:2px solid #fff;
      display:none;
    }
    #chat-window {
      position:fixed; bottom:5.5rem; right:1.5rem; z-index:1000;
      width:340px; max-height:520px;
      background:#fff; border-radius:16px;
      box-shadow:0 8px 40px rgba(0,0,0,0.18);
      display:none; flex-direction:column;
      overflow:hidden; border:1px solid #e2e8f0;
      font-family:'Segoe UI',system-ui,sans-serif;
    }
    #chat-window.open { display:flex; }
    .chat-header {
      background:linear-gradient(135deg,#1a73e8,#0d47a1);
      color:#fff; padding:1rem 1.25rem;
      display:flex; align-items:center; gap:0.75rem;
    }
    .chat-header .bot-avatar {
      width:38px; height:38px; border-radius:50%;
      background:rgba(255,255,255,0.2);
      display:flex; align-items:center; justify-content:center; font-size:1.3rem;
    }
    .chat-header .bot-info .bot-name { font-weight:700; font-size:0.95rem; }
    .chat-header .bot-info .bot-status { font-size:0.75rem; opacity:0.85; display:flex; align-items:center; gap:0.3rem; }
    .chat-header .bot-status-dot { width:7px; height:7px; background:#69f0ae; border-radius:50%; }
    .chat-header .close-btn { margin-left:auto; background:none; border:none; color:#fff; cursor:pointer; font-size:1.2rem; opacity:0.8; }
    .chat-header .close-btn:hover { opacity:1; }
    #chat-messages {
      flex:1; overflow-y:auto; padding:1rem;
      display:flex; flex-direction:column; gap:0.75rem;
      background:#f8fafc;
    }
    .msg { display:flex; gap:0.5rem; max-width:90%; }
    .msg.bot { align-self:flex-start; }
    .msg.user { align-self:flex-end; flex-direction:row-reverse; }
    .msg-avatar {
      width:28px; height:28px; border-radius:50%; flex-shrink:0;
      display:flex; align-items:center; justify-content:center; font-size:0.85rem;
    }
    .msg.bot .msg-avatar  { background:#e3f2fd; }
    .msg.user .msg-avatar { background:#1a73e8; color:#fff; }
    .msg-bubble {
      padding:0.65rem 0.9rem; border-radius:12px;
      font-size:0.85rem; line-height:1.55;
    }
    .msg.bot .msg-bubble  { background:#fff; border:1px solid #e2e8f0; color:#1e293b; border-top-left-radius:4px; }
    .msg.user .msg-bubble { background:#1a73e8; color:#fff; border-top-right-radius:4px; }
    .msg-time { font-size:0.7rem; color:#94a3b8; margin-top:0.2rem; text-align:right; }
    .typing-indicator { display:flex; gap:4px; padding:0.5rem 0.75rem; }
    .typing-indicator span { width:7px; height:7px; background:#94a3b8; border-radius:50%; animation:typingBounce 1.2s infinite; }
    .typing-indicator span:nth-child(2) { animation-delay:0.2s; }
    .typing-indicator span:nth-child(3) { animation-delay:0.4s; }
    @keyframes typingBounce { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-6px)} }
    .quick-replies { display:flex; flex-wrap:wrap; gap:0.4rem; padding:0 1rem 0.75rem; background:#f8fafc; }
    .qr-btn {
      padding:0.35rem 0.75rem; border-radius:20px; border:1.5px solid #1a73e8;
      background:#fff; color:#1a73e8; font-size:0.78rem; cursor:pointer;
      transition:background 0.15s; white-space:nowrap;
    }
    .qr-btn:hover { background:#e3f2fd; }
    .chat-input-row {
      display:flex; gap:0.5rem; padding:0.75rem 1rem;
      border-top:1px solid #e2e8f0; background:#fff;
    }
    #chat-input {
      flex:1; padding:0.6rem 0.9rem; border-radius:20px;
      border:1.5px solid #e2e8f0; font-size:0.875rem; outline:none;
      transition:border-color 0.2s;
    }
    #chat-input:focus { border-color:#1a73e8; }
    #chat-send-btn {
      width:38px; height:38px; border-radius:50%; border:none;
      background:#1a73e8; color:#fff; cursor:pointer; font-size:1rem;
      display:flex; align-items:center; justify-content:center;
      transition:background 0.2s;
    }
    #chat-send-btn:hover { background:#1557b0; }
  </style>

  <!-- FAB -->
  <button id="chat-fab" onclick="toggleChat()" title="Chat with SafeBot">
    🤖
    <span class="notif-dot" id="chat-notif-dot"></span>
  </button>

  <!-- Window -->
  <div id="chat-window">
    <div class="chat-header">
      <div class="bot-avatar">🛡️</div>
      <div class="bot-info">
        <div class="bot-name">SafeBot</div>
        <div class="bot-status"><span class="bot-status-dot"></span> Online — Tourist Safety Guide</div>
      </div>
      <button class="close-btn" onclick="toggleChat()">✕</button>
    </div>
    <div id="chat-messages"></div>
    <div class="quick-replies">
      <button class="qr-btn" onclick="chatSend('SOS emergency')">🆘 SOS</button>
      <button class="qr-btn" onclick="chatSend('location tracking')">📍 Tracking</button>
      <button class="qr-btn" onclick="chatSend('emergency contacts')">📞 Contacts</button>
      <button class="qr-btn" onclick="chatSend('weather alerts')">🌤️ Weather</button>
      <button class="qr-btn" onclick="chatSend('safety tips')">⚠️ Safety</button>
      <button class="qr-btn" onclick="chatSend('voice SOS')">🎙️ Voice</button>
    </div>
    <div class="chat-input-row">
      <input id="chat-input" type="text" placeholder="Ask me anything..."
             onkeydown="if(event.key==='Enter') chatSend()"/>
      <button id="chat-send-btn" onclick="chatSend()">➤</button>
    </div>
  </div>`;
  document.body.appendChild(el);

  // welcome message after short delay
  setTimeout(() => {
    addBotMsg(`👋 Hi! I'm <b>SafeBot</b> 🛡️<br>Your tourist safety assistant. How can I help you today?`);
    document.getElementById('chat-notif-dot').style.display = 'block';
  }, 1500);
}

let chatOpen = false;

function toggleChat() {
  chatOpen = !chatOpen;
  document.getElementById('chat-window').classList.toggle('open', chatOpen);
  document.getElementById('chat-fab').textContent = chatOpen ? '✕' : '🤖';
  if (chatOpen) {
    document.getElementById('chat-notif-dot').style.display = 'none';
    document.getElementById('chat-input').focus();
    scrollChat();
  } else {
    document.getElementById('chat-fab').innerHTML = '🤖<span class="notif-dot" id="chat-notif-dot"></span>';
  }
}

function chatSend(text) {
  const input = document.getElementById('chat-input');
  const msg   = (text || input.value).trim();
  if (!msg) return;
  input.value = '';

  addUserMsg(msg);
  showTyping();
  setTimeout(() => {
    removeTyping();
    addBotMsg(getBotReply(msg));
  }, 700 + Math.random() * 400);
}

function addUserMsg(text) {
  const now = new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
  const el  = document.createElement('div');
  el.className = 'msg user';
  el.innerHTML = `
    <div>
      <div class="msg-bubble">${escHtml(text)}</div>
      <div class="msg-time">${now}</div>
    </div>
    <div class="msg-avatar">👤</div>`;
  document.getElementById('chat-messages').appendChild(el);
  scrollChat();
}

function addBotMsg(html) {
  const now = new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
  const el  = document.createElement('div');
  el.className = 'msg bot';
  el.innerHTML = `
    <div class="msg-avatar">🛡️</div>
    <div>
      <div class="msg-bubble">${html}</div>
      <div class="msg-time">${now}</div>
    </div>`;
  document.getElementById('chat-messages').appendChild(el);
  scrollChat();
}

function showTyping() {
  const el = document.createElement('div');
  el.className = 'msg bot'; el.id = 'typing-msg';
  el.innerHTML = `<div class="msg-avatar">🛡️</div><div class="msg-bubble typing-indicator"><span></span><span></span><span></span></div>`;
  document.getElementById('chat-messages').appendChild(el);
  scrollChat();
}

function removeTyping() {
  const el = document.getElementById('typing-msg');
  if (el) el.remove();
}

function scrollChat() {
  const el = document.getElementById('chat-messages');
  if (el) el.scrollTop = el.scrollHeight;
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// Auto-init when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', buildChatbot);
} else {
  buildChatbot();
}
