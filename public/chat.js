// Njala Connect Frontend – Debug version
const token = localStorage.getItem('token');
if (!token) {
    alert('No token found. Redirecting to login.');
    window.location.href = '/';
}

let socket = io();
let currentUser = JSON.parse(localStorage.getItem('user'));
let currentChatId = null;
let chatHistory = [];
let allUsers = [];

// DOM elements
const usersListDiv = document.getElementById('usersList');
const messagesContainer = document.getElementById('messagesContainer');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const chatNameSpan = document.getElementById('chatName');
const chatStatusSpan = document.getElementById('chatStatus');
const chatAvatar = document.getElementById('chatAvatar');

// Helper to show errors in the UI
function showError(msg) {
    const errDiv = document.createElement('div');
    errDiv.style.background = '#ffdddd';
    errDiv.style.padding = '10px';
    errDiv.style.margin = '10px';
    errDiv.style.borderRadius = '8px';
    errDiv.style.color = '#d32f2f';
    errDiv.innerText = msg;
    usersListDiv.prepend(errDiv);
    setTimeout(() => errDiv.remove(), 5000);
}

// Load all users except current user
async function loadUsers() {
    try {
        const res = await fetch('/api/users', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        const users = await res.json();
        allUsers = users;
        console.log('Loaded users:', allUsers);
        if (allUsers.length === 0) {
            usersListDiv.innerHTML = '<div style="padding:1rem; text-align:center;">No other users found. Register a second account.</div>';
        } else {
            renderUsersList(allUsers);
        }
    } catch (err) {
        console.error('Failed to load users:', err);
        showError('Could not load contacts. Is the server running?');
        usersListDiv.innerHTML = '<div style="padding:1rem; text-align:center;">Error loading contacts. Check console.</div>';
    }
}

function renderUsersList(users) {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const filtered = users.filter(u =>
        u.full_name.toLowerCase().includes(searchTerm) ||
        u.matric_number.includes(searchTerm)
    );
    usersListDiv.innerHTML = filtered.map(user => `
        <div class="user-item" data-user-id="${user.id}">
            <div class="user-avatar">${user.full_name.charAt(0)}</div>
            <div class="user-info">
                <div class="user-name">${user.full_name}</div>
                <div class="user-status online">● Online</div>
            </div>
        </div>
    `).join('');

    // Attach click handlers
    document.querySelectorAll('.user-item').forEach(el => {
        el.addEventListener('click', () => {
            const userId = parseInt(el.dataset.userId);
            const user = allUsers.find(u => u.id === userId);
            if (user) openChat(user);
        });
    });
}

async function openChat(user) {
    currentChatId = user.id;
    chatNameSpan.innerText = user.full_name;
    chatStatusSpan.innerText = 'Online';
    chatAvatar.innerText = user.full_name.charAt(0);
    await loadMessages(user.id);
}

async function loadMessages(userId) {
    try {
        const res = await fetch(`/api/messages/${userId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Failed to load messages');
        const messages = await res.json();
        chatHistory = messages;
        renderMessages();
    } catch (err) {
        console.error('Message load error:', err);
    }
}

function renderMessages() {
    messagesContainer.innerHTML = chatHistory.map(msg => `
        <div class="message ${msg.from === currentUser.id ? 'sent' : 'received'}">
            ${msg.text}
            <div class="message-time">${new Date(msg.timestamp).toLocaleTimeString()}</div>
        </div>
    `).join('');
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

async function sendMessage() {
    const text = messageInput.value.trim();
    if (!text || !currentChatId) return;

    // Optimistic update
    const tempMsg = {
        from: currentUser.id,
        to: currentChatId,
        text: text,
        timestamp: new Date().toISOString()
    };
    chatHistory.push(tempMsg);
    renderMessages();
    messageInput.value = '';

    // Emit via socket for real-time
    socket.emit('send-private-message', {
        toUserId: currentChatId,
        fromUserId: currentUser.id,
        message: text
    });
}

// Socket events
socket.on('connect', () => {
    console.log('Socket connected');
    socket.emit('user-online', currentUser.id);
});

socket.on('private-message', (data) => {
    console.log('New private message:', data);
    if (data.fromUserId === currentChatId) {
        chatHistory.push({
            from: data.fromUserId,
            to: currentUser.id,
            text: data.message,
            timestamp: data.timestamp
        });
        renderMessages();
    } else {
        // Optional: show a browser notification or update the contact list badge
        const sender = allUsers.find(u => u.id === data.fromUserId);
        if (sender) {
            alert(`New message from ${sender.full_name}: ${data.message}`);
        }
    }
});

socket.on('user-status', ({ userId, status }) => {
    const userDiv = document.querySelector(`.user-item[data-user-id="${userId}"] .user-status`);
    if (userDiv) {
        userDiv.innerText = status === 'online' ? '● Online' : '○ Offline';
        userDiv.className = `user-status ${status === 'online' ? 'online' : 'offline'}`;
    }
});

// Event listeners
sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });
document.getElementById('searchInput').addEventListener('input', () => loadUsers());
document.getElementById('groupIcon').addEventListener('click', () => alert('Group chat coming soon!'));

// Initial load
loadUsers();