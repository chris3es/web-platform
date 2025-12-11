// Frontend-only data store using localStorage
const STORE_KEY = 'gamehub_state_v1';
const DEFAULT_ITEMS = [
  { id: 'pet_egg_basic', name: 'Basic Pet Egg', price: 100, mintCap: 10000, minted: 0 },
  { id: 'vip_pass', name: 'VIP Access', price: 500, mintCap: 1000, minted: 0 },
];

const PROFANITY = ['badword', 'slur1', 'slur2']; // Replace with real lists

function loadState() {
  const raw = localStorage.getItem(STORE_KEY);
  if (raw) return JSON.parse(raw);
  return {
    users: {},                 // username -> { balance, inventory: [itemId], receipts: [] }
    items: DEFAULT_ITEMS,      // array so it's easy to render
    reports: [],               // moderation reports
  };
}

function saveState(s) {
  localStorage.setItem(STORE_KEY, JSON.stringify(s));
}

let state = loadState();
let currentUser = null;

// UI elements
const usernameInput = document.getElementById('username');
const loginBtn = document.getElementById('loginBtn');
const tokenStatus = document.getElementById('tokenStatus');
const balanceSpan = document.getElementById('balance');
const grantBtn = document.getElementById('grantBtn');
const itemsUl = document.getElementById('items');
const inventoryUl = document.getElementById('inventory');
const receiptsUl = document.getElementById('receipts');
const roomInput = document.getElementById('roomId');
const joinRoomBtn = document.getElementById('joinRoom');
const chatInput = document.getElementById('chatInput');
const sendChatBtn = document.getElementById('sendChat');
const chatLog = document.getElementById('chatLog');
const reportTypeInput = document.getElementById('reportType');
const targetIdInput = document.getElementById('targetId');
const reasonInput = document.getElementById('reason');
const sendReportBtn = document.getElementById('sendReport');
const reportList = document.getElementById('reportList');

// Economy helpers
function ensureUser(name) {
  if (!state.users[name]) {
    state.users[name] = { balance: 1000, inventory: [], receipts: [] };
    saveState(state);
  }
  return state.users[name];
}

function renderEconomy() {
  if (!currentUser) return;
  const u = ensureUser(currentUser);

  balanceSpan.textContent = u.balance;

  // Items
  itemsUl.innerHTML = '';
  state.items.forEach(item => {
    const li = document.createElement('li');
    li.textContent = `${item.name} — ${item.price}`;
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = `minted ${item.minted}/${item.mintCap ?? '∞'}`;
    const btn = document.createElement('button');
    btn.textContent = 'Buy';
    btn.onclick = () => {
      if (item.mintCap && item.minted >= item.mintCap) return alert('Mint cap reached');
      if (u.balance < item.price) return alert('Insufficient balance');
      u.balance -= item.price;
      item.minted += 1;
      u.inventory.push(item.id);
      const receipt = {
        id: `${Date.now()}-${Math.random()}`,
        itemId: item.id,
        amount: item.price,
        timestamp: Date.now(),
      };
      u.receipts.push(receipt);
      saveState(state);
      renderEconomy();
    };
    li.appendChild(badge);
    li.appendChild(btn);
    itemsUl.appendChild(li);
  });

  // Inventory
  inventoryUl.innerHTML = '';
  u.inventory.forEach(id => {
    const li = document.createElement('li');
    li.textContent = id;
    inventoryUl.appendChild(li);
  });

  // Receipts
  receiptsUl.innerHTML = '';
  u.receipts.slice().reverse().forEach(r => {
    const li = document.createElement('li');
    li.textContent = `${new Date(r.timestamp).toLocaleString()} — ${r.itemId} — ${r.amount}`;
    receiptsUl.appendChild(li);
  });
}

// Auth
loginBtn.onclick = () => {
  const name = (usernameInput.value || '').trim() || 'guest';
  currentUser = name;
  tokenStatus.textContent = `Profile set: ${name}`;
  ensureUser(name);
  renderEconomy();
};

// Grant currency
grantBtn.onclick = () => {
  if (!currentUser) return alert('Set profile first');
  const u = ensureUser(currentUser);
  u.balance += 100;
  saveState(state);
  renderEconomy();
};

// Moderation filters
function sanitizeText(input) {
  const lowered = input.toLowerCase();
  let flagged = false;
  let output = input;
  for (const word of PROFANITY) {
    if (lowered.includes(word)) {
      flagged = true;
      const re = new RegExp(word, 'gi');
      output = output.replace(re, '****');
    }
  }
  return { output, flagged };
}

// Reports
function renderReports() {
  reportList.innerHTML = '';
  state.reports.slice().reverse().forEach(r => {
    const li = document.createElement('li');
    li.textContent = `Report ${r.id}: ${r.type} -> ${r.targetId} (flagged=${r.flagged}) — ${r.reason}`;
    reportList.appendChild(li);
  });
}

sendReportBtn.onclick = () => {
  if (!currentUser) return alert('Set profile first');
  const type = (reportTypeInput.value || 'chat').trim();
  const targetId = (targetIdInput.value || 'unknown').trim();
  const clean = sanitizeText((reasonInput.value || '').trim());
  const entry = {
    id: `${Date.now()}-${Math.random()}`,
    userId: currentUser,
    type,
    targetId,
    reason: clean.output,
    flagged: clean.flagged,
    timestamp: Date.now(),
  };
  state.reports.push(entry);
  saveState(state);
  renderReports();
  reasonInput.value = '';
};

// “Multiplayer” via BroadcastChannel (works across tabs on same origin)
let channel = null;
let joinedRoom = null;

function setupChannel(roomId) {
  if (channel) channel.close();
  channel = new BroadcastChannel(`room:${roomId}`);
  joinedRoom = roomId;

  // Announce join
  channel.postMessage({ type: 'system:join', userId: currentUser });

  // Listen
  channel.onmessage = (ev) => {
    const msg = ev.data;
    if (msg.type === 'chat:recv') {
      addChat(`${msg.from}: ${msg.message}`);
    } else if (msg.type === 'system:join') {
      addChat(`[system] ${msg.userId} joined`);
    } else if (msg.type === 'system:leave') {
      addChat(`[system] ${msg.userId} left`);
    }
  };

  // On tab close, announce leave
  window.addEventListener('beforeunload', () => {
    if (channel) channel.postMessage({ type: 'system:leave', userId: currentUser });
  });
}

function addChat(text) {
  const li = document.createElement('li');
  li.textContent = text;
  chatLog.appendChild(li);
  chatLog.scrollTop = chatLog.scrollHeight;
}

joinRoomBtn.onclick = () => {
  if (!currentUser) return alert('Set profile first');
  const roomId = (roomInput.value || 'room-1').trim();
  setupChannel(roomId);
  addChat(`[system] joined ${roomId} as ${currentUser}. Open another tab to chat.`);
};

sendChatBtn.onclick = () => {
  if (!currentUser) return alert('Set profile first');
  if (!channel) return alert('Join a room first');
  const raw = (chatInput.value || '').trim();
  if (!raw) return;
  const clean = sanitizeText(raw);
  chatInput.value = '';
  // Echo to local log (sender)
  addChat(`${currentUser}: ${clean.output}${clean.flagged ? ' [filtered]' : ''}`);
  // Broadcast to others
  channel.postMessage({ type: 'chat:recv', from: currentUser, message: clean.output });
};

// Initial render (if user was set before)
(function init() {
  if (localStorage.getItem('lastUser')) {
    currentUser = localStorage.getItem('lastUser');
    tokenStatus.textContent = `Profile set: ${currentUser}`;
    ensureUser(currentUser);
    renderEconomy();
  }
})();

// Persist username when set
new MutationObserver(() => {
  if (currentUser) localStorage.setItem('lastUser', currentUser);
}).observe(tokenStatus, { childList: true });
