/* ═══════════════════════════════════════════════════════════════
   LAN Classroom Chat — client.js
   Architecture: Login → Dashboard
   Features:
     • Bootstrap-free, vanilla JS
     • Global + Private messaging channels
     • File uploads via REST /upload + Socket relay
     • Emoji picker (from chat_app_modified)
     • Typing indicators (debounced)
     • Toast notifications (private msg while on another channel)
     • Audio notification on receive
     • Admin: End Class Session
     • Session auto-wipe listener
═══════════════════════════════════════════════════════════════ */

'use strict';
import { animate, spring } from './motion.js';

// ─── State ────────────────────────────────────────────────────────────────────
let socket = null;
let myProfile = { id: null, nickname: null, role: null };
let activeChannel = 'global';
let chatHistory = { global: [] };
let connectedUsers = [];
let myTypingTimeout = null;   // Fix #6: separate outbound typing debounce
let remoteTypingTimeout = null; // Fix #6: separate inbound typing display
let isTyping = false;
let audioEnabled = false;
let emojiPickerOpen = false;
let selectedFiles = [];
let isInitialized = false;
let serverUrl = ''; // Global server URL (populated via mDNS or manual fallback in Native app)

// ─── Native App Detection ─────────────────────────────────────────────────────
function isNativeApp() {
    // Detect Capacitor or other native wrappers
    return !!window.Capacitor || (window.Android && window.Android.isNative) || false;
}

// Colour shades for received bubbles (per user hash)
const BUBBLE_SHADES = [
    'rgba(127,166,156,0.15)',  // meadow-sage
    'rgba(125,110,180,0.15)',  // violet
    'rgba(86,160,200,0.15)',   // sky
    'rgba(200,160,100,0.15)',  // amber
    'rgba(160,100,180,0.15)',  // purple
    'rgba(100,180,140,0.15)',  // teal
    'rgba(200,120,120,0.15)',  // rose
    'rgba(100,140,200,0.15)',  // periwinkle
];

const BUBBLE_BORDERS = [
    'rgba(127,166,156,0.3)',
    'rgba(125,110,180,0.3)',
    'rgba(86,160,200,0.3)',
    'rgba(200,160,100,0.3)',
    'rgba(160,100,180,0.3)',
    'rgba(100,180,140,0.3)',
    'rgba(200,120,120,0.3)',
    'rgba(100,140,200,0.3)',
];

// ─── Emoji data (from chat_app_modified) ─────────────────────────────────────
const emojiData = {
    smileys: ['😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩', '🥳', '😏'],
    people: ['👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍', '👎', '👊', '✊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '✍️'],
    nature: ['🌟', '⭐', '🌙', '☀️', '⛅', '☁️', '🌈', '🔥', '💧', '❄️', '⚡', '🌸', '🌺', '🌻', '🌹', '🌷', '🌼', '💐', '🌿', '🍀', '🌱', '🌳', '🌲', '🌴', '🌵', '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻'],
    food: ['🍕', '🍔', '🍟', '🌭', '🥪', '🌮', '🌯', '🥙', '🧆', '🥚', '🍳', '🧈', '🥞', '🧇', '🥓', '🥩', '🍗', '🍖', '🦴', '🌶️', '🥕', '🌽', '🥒', '🥬', '🥑', '🍅', '🧄', '🧅', '🥔', '🍠', '🥐', '🍞'],
    activities: ['⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉', '🥏', '🎱', '🪀', '🏓', '🏸', '🏒', '🏑', '🥍', '🏏', '🪃', '🥅', '⛳', '🪁', '🏹', '🎣', '🤿', '🥊', '🥋', '🎽', '🛹', '🛷', '⛸️', '🥌', '🎿'],
    travel: ['✈️', '🚗', '🚕', '🚙', '🚌', '🚎', '🏎️', '🚓', '🚑', '🚒', '🚐', '🛻', '🚚', '🚛', '🚜', '🏍️', '🛵', '🚲', '🛴', '🛹', '🚁', '🛸', '🚀', '🛰️', '💺', '⛵', '🚤', '🛥️', '🛳️', '⛴️', '🚢', '⚓'],
    objects: ['💡', '🔦', '🕯️', '🪔', '🧯', '🛢️', '💸', '💰', '💴', '💵', '💶', '💷', '🪙', '💳', '💎', '⚖️', '🪜', '🧰', '🔧', '🔨', '⛏️', '🪚', '🔩', '⚙️', '🪤', '🧲', '🔫', '💣', '🧨', '🪓', '🔪', '⚔️'],
    symbols: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '☮️', '✝️', '☪️', '🕉️', '☸️', '✡️', '🔯', '🕎', '☯️', '☦️', '🛐', '⛎', '♈'],
};

// ─── Utility: simple string hash → colour index ───────────────────────────────
function hashIndex(str, len) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (str.charCodeAt(i) + ((h << 5) - h)) | 0;
    return Math.abs(h) % len;
}

function getBubbleStyle(username) {
    const idx = hashIndex(username, BUBBLE_SHADES.length);
    return `background:${BUBBLE_SHADES[idx]};border:1px solid ${BUBBLE_BORDERS[idx]};`;
}

// ─── Utility: XSS escape ──────────────────────────────────────────────────────────
function escapeHTML(str) {
    // Fix #15: Return empty string for null/undefined instead of "null"/"undefined"
    if (str == null) return '';
    return String(str).replace(/[&<>'"]/g, tag => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[tag]));
}

// ─── Utility: Format file size ────────────────────────────────────────────────
function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024, sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// ─── Utility: File icon ───────────────────────────────────────────────────────
function getFileIcon(mimetype) {
    if (!mimetype) return 'fa-file';
    if (mimetype.startsWith('image/')) return 'fa-image';
    if (mimetype === 'application/pdf') return 'fa-file-pdf';
    if (mimetype.includes('word')) return 'fa-file-word';
    if (mimetype === 'text/plain') return 'fa-file-lines';
    if (mimetype.includes('zip') || mimetype.includes('rar')) return 'fa-file-zipper';
    return 'fa-file';
}

// ─── Utility: Ensure channel history exists ───────────────────────────────────
function ensureHistory(id) {
    if (!chatHistory[id]) chatHistory[id] = [];
}

// ═══════════════════════════════════════════════════════════════
// NATIVE APP NETWORK DISCOVERY & BACKGROUND SYNC
// ═══════════════════════════════════════════════════════════════
let isAppInForeground = true;

async function setupDiscovery() {
    const { App, LocalNotifications } = window.Capacitor.Plugins;
    
    if (App) {
        App.addListener('appStateChange', ({ isActive }) => {
            isAppInForeground = isActive;
            if (isActive && typeof socket !== 'undefined' && socket.disconnected) {
                socket.connect();
            }
        });
        App.addListener('backButton', ({ canGoBack }) => {
            const sidebar = document.getElementById('sidebar');
            if (sidebar && sidebar.classList.contains('open')) {
                closeMobileSidebar();
                return;
            }
            if (typeof emojiPickerOpen !== 'undefined' && emojiPickerOpen) {
                closeEmojiPicker();
                return;
            }
            if (typeof aiPanelOpen !== 'undefined' && aiPanelOpen) {
                toggleAIPanel();
                return;
            }
            if (activeChannel !== 'global') {
                document.getElementById('btn-global-chat').click();
                return;
            }
            App.minimizeApp();
        });
    }

    if (LocalNotifications) {
        LocalNotifications.requestPermissions();
    }

    const loginView = document.getElementById('login-view');
    const discoveryView = document.getElementById('discovery-view');
    
    loginView.style.display = 'none';
    discoveryView.style.display = 'flex';

    // Show manual fallback if not found within 5 seconds
    let discoveryTimeout = setTimeout(() => {
        const loader = document.getElementById('discovery-loader');
        if (loader) loader.style.display = 'none';
        
        const fallback = document.getElementById('manual-ip-fallback');
        if (fallback) fallback.style.display = 'block';
        
        document.getElementById('discovery-title').textContent = 'Server Not Found';
        document.getElementById('discovery-subtitle').textContent = 'Please enter the IP manually';
    }, 5000);

    const manualForm = document.getElementById('manual-ip-form');
    if (manualForm) {
        manualForm.addEventListener('submit', (e) => {
            e.preventDefault();
            let ip = document.getElementById('ip-input').value.trim();
            // clean up common user entry mistakes
            if (!ip.startsWith('http')) {
                ip = `http://${ip}`;
            }
            
            try {
                let urlObj = new URL(ip);
                if (!urlObj.port) {
                    urlObj.port = '3001';
                }
                ip = urlObj.origin;
            } catch (e) {
                // fallback if URL is somehow invalid
                if (ip.split(':').length === 2) {
                    ip = `${ip}:3001`;
                }
            }
            
            serverUrl = ip;
            window.SERVER_URL = serverUrl;
            discoveryView.style.display = 'none';
            loginView.style.display = 'flex';
        });
    }

    try {
        const { ZeroConf } = window.Capacitor.Plugins;
        if (ZeroConf) {
            ZeroConf.addListener('discover', (result) => {
                if (result.action === 'resolved' && result.service.type === '_lanchat._tcp.') {
                    clearTimeout(discoveryTimeout);
                    const ip = result.service.ipv4Addresses[0];
                    if (!ip) return; // Android cannot resolve .local natively over HTTP
                    const port = result.service.port;
                    serverUrl = `http://${ip}:${port}`;
                    window.SERVER_URL = serverUrl;
                    
                    ZeroConf.stopWatch({ type: '_lanchat._tcp.', domain: 'local.' });
                    
                    discoveryView.style.display = 'none';
                    loginView.style.display = 'flex';
                }
            });
            await ZeroConf.watch({ type: '_lanchat._tcp.', domain: 'local.' });
        }
    } catch (e) {
        console.warn('[mDNS] ZeroConf plugin error or unavailable:', e);
    }
}

// Native Notification Helper
async function triggerNativeNotification(msg) {
    if (!isNativeApp() || isAppInForeground) return;
    try {
        const { LocalNotifications } = window.Capacitor.Plugins;
        if (LocalNotifications) {
            await LocalNotifications.schedule({
                notifications: [
                    {
                        title: msg.senderName,
                        body: msg.content.substring(0, 50) + (msg.content.length > 50 ? '...' : ''),
                        id: Date.now(),
                        schedule: { at: new Date(Date.now() + 100) },
                        sound: null,
                        smallIcon: "ic_stat_icon_config_sample"
                    }
                ]
            });
        }
    } catch (err) {
        console.warn('[Native] Notification error:', err);
    }
}

// Native Download Helper
window.downloadNativeFile = async (url, filename, e) => {
    if (!isNativeApp()) return;
    e.preventDefault();
    
    const { Filesystem, Directory } = window.Capacitor.Plugins;
    if (!Filesystem) return;
    
    showToast('Downloading', `Starting download for ${filename}...`);
    
    try {
        let downloadUrl = url;
        if (!downloadUrl.startsWith('http')) {
            downloadUrl = serverUrl ? `${serverUrl}${downloadUrl}` : downloadUrl;
        }
        
        const result = await Filesystem.downloadFile({
            url: downloadUrl,
            path: filename,
            directory: Directory.Documents
        });
        
        showToast('Download Complete', `File saved to Documents folder.`);
    } catch (err) {
        console.error('Download error:', err);
        showToast('Download Failed', 'Could not save the file.');
    }
};

// ═══════════════════════════════════════════════════════════════
// LOGIN
// ═══════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
    if (isNativeApp()) {
        setupDiscovery();
    }

    const loginForm = document.getElementById('login-form');
    const loginError = document.getElementById('login-error');

    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const nickname = document.getElementById('nickname-input').value.trim();
        const password = document.getElementById('password-input').value.trim();

        if (!nickname) {
            loginError.textContent = 'Please enter a nickname.';
            loginError.style.display = 'block';
            return;
        }
        loginError.style.display = 'none';
        connectAndJoin(nickname, password);
    });
});

function connectAndJoin(nickname, password) {
    // Fix #8: Guard against orphaned socket instances on repeated login attempts
    if (socket) {
        socket.disconnect();
        socket = null;
    }

    socket = serverUrl ? io(serverUrl) : io();

    socket.on('connect', () => {
        myProfile.id = socket.id;
        myProfile.nickname = nickname;
        // Fix #1: Role is no longer determined client-side.
        // It will be set when the server responds with 'join_success'.

        socket.emit('join', { nickname, password });

        if (!isInitialized) {
            document.getElementById('login-view').style.display = 'none';
            const dash = document.getElementById('dashboard-view');
            dash.style.display = 'flex';

            document.getElementById('sidebar-username').textContent = nickname;
            document.getElementById('sidebar-avatar').textContent = nickname.charAt(0).toUpperCase();
            document.getElementById('online-count').textContent = '1 online';
            document.getElementById('sidebar-online-count').textContent = '1 online';
            // Role and admin controls are applied in the 'join_success' handler

            setupDashboardListeners();
            setupSocketListeners();
            
            // Native App UI Initialization
            if (isNativeApp()) {
                document.body.classList.add('is-native');
                
                // Initialize bottom nav tab switching
                const tabs = ['chat', 'users', 'admin'];
                const navBtns = document.querySelectorAll('.bottom-nav .nav-item');
                
                navBtns.forEach(btn => {
                    btn.addEventListener('click', () => {
                        const targetTab = btn.dataset.tab;
                        
                        // Update active state on buttons
                        navBtns.forEach(b => b.classList.remove('active'));
                        btn.classList.add('active');
                        
                        // Show/Hide views based on tab
                        const chatPane = document.querySelector('.chat-pane');
                        const sidebar = document.querySelector('.sidebar');
                        const adminTab = document.getElementById('admin-tab-view');
                        
                        chatPane.classList.toggle('active-tab', targetTab === 'chat');
                        sidebar.classList.toggle('active-tab', targetTab === 'users');
                        if (adminTab) adminTab.classList.toggle('active-tab', targetTab === 'admin');
                    });
                });
                
                // Set default active view
                document.querySelector('.chat-pane').classList.add('active-tab');
            }

            isInitialized = true;
        } else {
            // Reconnection: restore UI
            document.getElementById('offline-banner').style.display = 'none';
            document.getElementById('messageInp').disabled = false;
            document.querySelector('.send-btn').disabled = false;
        }
    });

    socket.on('join_error', (data) => {
        const errorEl = document.getElementById('login-error');
        errorEl.textContent = data.message;
        errorEl.style.display = 'block';
        
        // Disconnect so the user can try again safely
        if (socket) socket.disconnect();
        
        const btn = document.querySelector('.login-btn');
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-arrow-right-to-bracket me-2"></i>Enter Workspace';
    });

    socket.on('error_message', (data) => {
        showToast(data.message, 'error');
    });

    socket.on('connect_error', (err) => {
        console.error('[SOCKET] connect_error:', err);
        document.getElementById('login-error').textContent = 'Could not connect to server. Is it running?';
        document.getElementById('login-error').style.display = 'block';
        // Fix #14: Only show login view if we haven't successfully initialized
        if (!isInitialized) {
            document.getElementById('login-view').style.display = 'flex';
        }
    });
}

// ═══════════════════════════════════════════════════════════════
// DASHBOARD LISTENERS
// ═══════════════════════════════════════════════════════════════
function setupDashboardListeners() {
    // Global chat button
    document.getElementById('btn-global-chat').addEventListener('click', () => {
        switchChannel('global', 'Global Classroom', null, 'channel');
        if (isNativeApp()) {
            const chatNavBtn = document.querySelector('.bottom-nav .nav-item[data-tab="chat"]');
            if (chatNavBtn) chatNavBtn.click();
        } else if (window.innerWidth <= 767) {
            closeMobileSidebar();
        }
    });

    // Admin: End Session
    const endBtn = document.getElementById('btn-end-session');
    if (endBtn) {
        endBtn.addEventListener('click', () => {
            if (confirm('End the class session and wipe all chat data for everyone?')) {
                socket.emit('end_session');
            }
        });
    }

    // Admin: Announcement (modal-based)
    const annBtn = document.getElementById('btn-announcement');
    const annModal = document.getElementById('announcement-modal');
    const annClose = document.getElementById('announcement-modal-close');
    const annInput = document.getElementById('announcement-input');
    const annCharCount = document.getElementById('announcement-char-count');
    const annSendBtn = document.getElementById('announcement-send-btn');

    if (annBtn && annModal) {
        annBtn.addEventListener('click', () => {
            annModal.showModal();
            annInput.value = '';
            annCharCount.textContent = '0/1000';
            annInput.focus();
        });
        // Light dismiss
        annModal.addEventListener('click', (e) => { if (e.target === annModal) annModal.close(); });
        annInput.addEventListener('input', () => { annCharCount.textContent = `${annInput.value.length}/1000`; });
        annSendBtn.addEventListener('click', () => {
            const msg = annInput.value.trim();
            if (msg) {
                socket.emit('announcement', msg);
                annModal.close();
            }
        });
    }

    // Admin: Create Poll (modal-based)
    const pollBtn = document.getElementById('btn-create-poll');
    const pollModal = document.getElementById('poll-modal');
    const pollClose = document.getElementById('poll-modal-close');
    const pollQInput = document.getElementById('poll-question-input');
    const pollOptContainer = document.getElementById('poll-options-container');
    const pollAddOptBtn = document.getElementById('poll-add-option');
    const pollSendBtn = document.getElementById('poll-send-btn');
    const pollOptCount = document.getElementById('poll-option-count');

    if (pollBtn && pollModal) {
        pollBtn.addEventListener('click', () => {
            pollModal.showModal();
            pollQInput.value = '';
            pollOptContainer.innerHTML = `
                <input type="text" class="modal-input poll-option-input" maxlength="100" placeholder="Option 1" style="margin-bottom:6px;">
                <input type="text" class="modal-input poll-option-input" maxlength="100" placeholder="Option 2" style="margin-bottom:6px;">
            `;
            pollOptCount.textContent = '2 options';
            pollQInput.focus();
        });
        // Light dismiss
        pollModal.addEventListener('click', (e) => { if (e.target === pollModal) pollModal.close(); });
        pollAddOptBtn.addEventListener('click', () => {
            const current = pollOptContainer.querySelectorAll('.poll-option-input').length;
            if (current >= 5) return;
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'modal-input poll-option-input';
            input.maxLength = 100;
            input.placeholder = `Option ${current + 1}`;
            input.style.marginBottom = '6px';
            pollOptContainer.appendChild(input);
            pollOptCount.textContent = `${current + 1} options`;
            input.focus();
            if (current + 1 >= 5) pollAddOptBtn.style.display = 'none';
        });
        pollSendBtn.addEventListener('click', () => {
            const question = pollQInput.value.trim();
            const optInputs = pollOptContainer.querySelectorAll('.poll-option-input');
            const options = Array.from(optInputs).map(i => i.value.trim()).filter(v => v.length > 0);
            if (!question) { pollQInput.focus(); return; }
            if (options.length < 2) { showToast('Poll Error', 'A poll needs at least 2 non-empty options.'); return; }
            socket.emit('create_poll', { question, options });
            pollModal.close();
        });
    }

    // Teacher Notepad Sync
    const notepad = document.getElementById('class-notepad');
    if (notepad) {
        let notepadTimeout;
        notepad.addEventListener('input', () => {
            if (myProfile.role !== 'Teacher/Admin') return;
            clearTimeout(notepadTimeout);
            notepadTimeout = setTimeout(() => {
                socket.emit('notepad_update', notepad.value);
            }, 500);
        });
    }

    // Student: Raise Hand
    const handBtn = document.getElementById('btn-raise-hand');
    if (handBtn) {
        handBtn.addEventListener('click', () => {
            const textEl = document.getElementById('raise-hand-text');
            if (textEl.textContent === 'Raise Hand') {
                socket.emit('raise_hand');
                textEl.textContent = 'Lower Hand';
                handBtn.style.opacity = '0.7';
            } else {
                socket.emit('lower_hand');
                textEl.textContent = 'Raise Hand';
                handBtn.style.opacity = '1';
            }
        });
    }

    // Download App button — Full PWA install flow
    const downloadBtn = document.getElementById('btn-download-app');
    if (downloadBtn) {
        if (isNativeApp()) {
            // Hide the PWA install button if already in native app wrapper
            downloadBtn.style.display = 'none';
        } else {
            let deferredPrompt = null;

            // Capture the install prompt event (Chromium browsers only)
            window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
            // Show a visual cue that install is available
            downloadBtn.classList.add('install-ready');
        });

        window.addEventListener('appinstalled', () => {
            deferredPrompt = null;
            downloadBtn.classList.remove('install-ready');
            showToast('App Installed', 'LAN Chat has been added to your device!');
        });

        downloadBtn.addEventListener('click', async () => {
            if (deferredPrompt) {
                // Chromium: trigger native install prompt
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                if (outcome === 'accepted') {
                    deferredPrompt = null;
                }
            } else if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {
                // iOS Safari: show manual instructions
                showIOSInstallModal();
            } else if (window.matchMedia('(display-mode: standalone)').matches) {
                showToast('Already Installed', 'The app is already running in standalone mode.');
            } else {
                showToast('Install Info', 'Use your browser menu → "Add to Home Screen" or "Install App" to install.');
            }
        });
        } // end if (!isNativeApp)
    }

    // Mobile sidebar
    document.getElementById('mobile-sidebar-btn').addEventListener('click', openMobileSidebar);
    document.getElementById('sidebar-close-btn').addEventListener('click', closeMobileSidebar);

    // Audio toggle
    const audioBtn = document.getElementById('enableAudio');
    audioBtn.addEventListener('click', () => {
        audioEnabled = !audioEnabled;
        const icon = audioBtn.querySelector('i');
        icon.className = audioEnabled ? 'fas fa-volume-high' : 'fas fa-volume-xmark';
        audioBtn.classList.toggle('active', audioEnabled);
    });

    // Theme toggle
    const themeBtn = document.getElementById('theme-toggle');
    if (themeBtn) {
        let isLightMode = false;
        themeBtn.addEventListener('click', () => {
            isLightMode = !isLightMode;
            document.body.classList.toggle('light-theme', isLightMode);
            const icon = themeBtn.querySelector('i');
            icon.className = isLightMode ? 'fas fa-sun' : 'fas fa-moon';
        });
    }

    // Emoji picker
    const emojiBtn = document.getElementById('emoji-btn');
    const emojiPicker = document.getElementById('emoji-picker');
    emojiBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        emojiPickerOpen = !emojiPickerOpen;
        emojiPicker.style.display = emojiPickerOpen ? 'block' : 'none';
        if (emojiPickerOpen) {
            initEmojiPicker();
            setTimeout(() => document.addEventListener('click', handleEmojiOutsideClick), 100);
        } else {
            document.removeEventListener('click', handleEmojiOutsideClick);
        }
    });

    // File upload handled by native label for="file-input"
    document.getElementById('file-input').addEventListener('change', handleFileSelection);
    document.getElementById('clear-files').addEventListener('click', clearSelectedFiles);

    // Message form
    const form = document.getElementById('send-container');
    const input = document.getElementById('messageInp');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const content = input.value.trim();
        const hasFiles = selectedFiles.length > 0;
        if (!content && !hasFiles) return;

        // Stop typing
        if (isTyping) {
            isTyping = false;
            socket.emit('typing', { channel: activeChannel });
        }

        // Upload + send files first
        if (hasFiles) {
            await uploadAndSendFiles();
        }

        // Send text
        if (content) {
            input.value = '';
            updateCharCount();
            if (activeChannel === 'global') {
                socket.emit('global_message', content);
            } else {
                socket.emit('private_message', { targetId: activeChannel, content });
            }
        }

        // Send animation
        const sendBtn = form.querySelector('.send-btn');
        sendBtn.style.transform = 'scale(0.9)';
        setTimeout(() => { sendBtn.style.transform = ''; }, 150);
    });

    // Typing indicator + char count
    input.addEventListener('input', () => {
        updateCharCount();
        if (!isTyping && input.value.length > 0) {
            isTyping = true;
            socket.emit('typing', { channel: activeChannel });
        }
        clearTimeout(myTypingTimeout); // Fix #6: use separate outbound timer
        myTypingTimeout = setTimeout(() => {
            if (isTyping) {
                isTyping = false;
                socket.emit('typing', { channel: activeChannel });
            }
        }, 1500);
    });

    // Enter = submit
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            form.requestSubmit();
        }
    });
}

// ─── Mobile Sidebar ───────────────────────────────────────────────────────────
function openMobileSidebar() {
    if (typeof isNativeApp === 'function' && isNativeApp()) return;
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.add('open');

    // Remove inline styles in case they were set by dragging or previous close
    sidebar.style.transform = 'translateX(-100%)';

    // Animate using motion (critically damped spring)
    animate(sidebar, { transform: 'translateX(0)' }, {
        type: 'spring', bounce: 0, duration: 0.4
    });
}

function closeMobileSidebar() {
    if (typeof isNativeApp === 'function' && isNativeApp()) return;
    const sidebar = document.getElementById('sidebar');

    animate(sidebar, { transform: 'translateX(-100%)' }, {
        type: 'spring', bounce: 0, duration: 0.4
    }).finished.then(() => {
        sidebar.classList.remove('open');
        sidebar.style.transform = '';
    });
}

// ─── Char count ───────────────────────────────────────────────────────────────
function updateCharCount() {
    const len = document.getElementById('messageInp').value.length;
    const el = document.getElementById('char-count');
    el.textContent = `${len}/500`;
    el.style.color = len > 450 ? 'var(--firefly-coral)' : len > 300 ? '#f59e0b' : 'var(--mist-gray)';
}

// ═══════════════════════════════════════════════════════════════
// EMOJI PICKER
// ═══════════════════════════════════════════════════════════════
function initEmojiPicker() {
    showEmojiCategory('smileys');
    document.querySelectorAll('.emoji-category').forEach(btn => {
        btn.onclick = (e) => {
            document.querySelectorAll('.emoji-category').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            showEmojiCategory(e.currentTarget.dataset.category);
        };
    });
}

function showEmojiCategory(cat) {
    const grid = document.getElementById('emoji-grid');
    grid.innerHTML = '';
    (emojiData[cat] || emojiData.smileys).forEach(emoji => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'emoji-button';
        btn.textContent = emoji;
        btn.onclick = () => insertEmoji(emoji);
        grid.appendChild(btn);
    });
}

function insertEmoji(emoji) {
    const input = document.getElementById('messageInp');
    const pos = input.selectionStart;
    input.value = input.value.substring(0, pos) + emoji + input.value.substring(pos);
    input.focus();
    input.setSelectionRange(pos + emoji.length, pos + emoji.length);
    updateCharCount();
    closeEmojiPicker();
}

function closeEmojiPicker() {
    emojiPickerOpen = false;
    document.getElementById('emoji-picker').style.display = 'none';
    document.removeEventListener('click', handleEmojiOutsideClick);
}

function handleEmojiOutsideClick(e) {
    const picker = document.getElementById('emoji-picker');
    const btn = document.getElementById('emoji-btn');
    if (!picker.contains(e.target) && !btn.contains(e.target)) closeEmojiPicker();
}

// ═══════════════════════════════════════════════════════════════
// FILE HANDLING
// ═══════════════════════════════════════════════════════════════
function handleFileSelection(e) {
    Array.from(e.target.files).forEach(file => {
        if (validateFile(file)) selectedFiles.push(file);
    });
    renderFilePreview();
    e.target.value = '';
}

function validateFile(file) {
    const MAX_IMAGE = 5 * 1024 * 1024;  // 5MB for images
    const MAX_DOC = 10 * 1024 * 1024; // 10MB for docs
    const allowed = [
        'image/jpeg', 'image/png', 'image/gif', 'image/webp',
        'application/pdf', 'text/plain', 'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/zip', 'application/x-rar-compressed', 'application/x-zip-compressed'
    ];

    if (!allowed.includes(file.type)) {
        showToast('Unsupported File', `"${file.name}" — type not allowed.`);
        return false;
    }
    const limit = file.type.startsWith('image/') ? MAX_IMAGE : MAX_DOC;
    if (file.size > limit) {
        const limitLabel = file.type.startsWith('image/') ? '5MB' : '10MB';
        showToast('File Too Large', `"${file.name}" exceeds the ${limitLabel} limit.`);
        return false;
    }
    return true;
}

function renderFilePreview() {
    const preview = document.getElementById('file-preview');
    const content = document.getElementById('preview-content');
    if (selectedFiles.length === 0) { preview.style.display = 'none'; return; }
    preview.style.display = 'block';
    content.innerHTML = '';
    selectedFiles.forEach((f, i) => {
        const item = document.createElement('div');
        item.className = 'file-item';
        item.innerHTML = `
            <i class="fas ${getFileIcon(f.type)} file-icon"></i>
            <div class="file-info">
                <div class="file-name" title="${escapeHTML(f.name)}">${escapeHTML(f.name)}</div>
                <div class="file-size">${formatFileSize(f.size)}</div>
            </div>
            <button type="button" class="file-remove-btn" title="Remove"><i class="fas fa-xmark"></i></button>
        `;
        item.querySelector('.file-remove-btn').addEventListener('click', () => {
            selectedFiles.splice(i, 1);
            renderFilePreview();
        });
        content.appendChild(item);
    });
}

function clearSelectedFiles() {
    selectedFiles = [];
    renderFilePreview();
}

// Upload files to server, then emit socket events
async function uploadAndSendFiles() {
    const form = new FormData();
    selectedFiles.forEach(f => form.append('files', f));

    // Show uploading state
    const footerEl = document.querySelector('.form-footer');
    const progress = document.createElement('div');
    progress.className = 'upload-progress';
    progress.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading files…';
    footerEl.prepend(progress);

    try {
        // Fix #2: Pass socket ID as auth header so server can validate the upload
        const uploadUrl = serverUrl ? `${serverUrl}/upload` : '/upload';
        const res = await fetch(uploadUrl, {
            method: 'POST',
            body: form,
            headers: { 'x-socket-id': socket.id }
        });
        if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
        const data = await res.json();

        data.files.forEach(uploadedFile => {
            if (activeChannel === 'global') {
                socket.emit('global_file', uploadedFile);
            } else {
                socket.emit('private_file', { targetId: activeChannel, filePayload: uploadedFile });
            }
        });
    } catch (err) {
        console.error('[UPLOAD] Error:', err);
        showToast('Upload Failed', err.message);
    } finally {
        progress.remove();
        clearSelectedFiles();
    }
}

// ═══════════════════════════════════════════════════════════════
// CHANNEL SWITCHING
// ═══════════════════════════════════════════════════════════════
function switchChannel(channelId, channelName, userRole, type) {
    activeChannel = channelId;

    // Sidebar button states
    const globalBtn = document.getElementById('btn-global-chat');
    globalBtn.classList.toggle('active', channelId === 'global');

    // Chat header
    const titleEl = document.getElementById('chat-header-title');
    const subtitleEl = document.getElementById('chat-header-subtitle');
    const avatarEl = document.getElementById('chat-header-avatar');

    if (channelId === 'global') {
        titleEl.textContent = 'Global Classroom';
        subtitleEl.textContent = 'Everyone can see these messages';
        avatarEl.innerHTML = '<i class="fas fa-globe"></i>';
        avatarEl.style.color = 'var(--firefly-coral)';
    } else {
        titleEl.textContent = channelName;
        subtitleEl.textContent = userRole === 'Teacher/Admin' ? '⭐ Teacher/Admin — Private Thread' : 'Private Thread';
        avatarEl.innerHTML = channelName.charAt(0).toUpperCase();
        avatarEl.style.color = 'var(--meadow-sage)';
    }

    renderUserList();
    renderMessages();

    // Hide welcome, show messages
    document.getElementById('welcome-message').style.display = 'none';
    document.getElementById('messages-container').style.display = 'flex';

    document.getElementById('messageInp').focus();
}

// ═══════════════════════════════════════════════════════════════
// RENDER: Messages
// ═══════════════════════════════════════════════════════════════
function renderMessages() {
    const container = document.getElementById('messages-container');
    container.innerHTML = '';
    const messages = chatHistory[activeChannel] || [];
    messages.forEach(msg => appendMsgToDOM(msg, container));
    container.scrollTop = container.scrollHeight;
}

function appendMsgToDOM(msg, container) {
    const isSelf = msg.senderId === myProfile.id;
    const isSystem = msg.type === 'system';
    const isBroadcast = msg.type === 'announcement' || msg.type === 'poll';

    const welcomeOverlay = document.getElementById('welcome-message');
    if (welcomeOverlay && welcomeOverlay.style.display !== 'none') {
        welcomeOverlay.style.display = 'none';
        document.getElementById('messages-container').style.display = 'flex';
    }

    const wrapper = document.createElement('div');
    // BUG-1 fix: Announcements and polls always render centered (like system messages)
    if (isBroadcast) {
        wrapper.className = 'message-wrapper system';
    } else {
        wrapper.className = `message-wrapper ${isSystem ? 'system' : isSelf ? 'sent' : 'received'}`;
    }
    if (msg.id) wrapper.dataset.id = msg.id;

    let metaHtml = '';
    if (!isSelf && !isSystem && !isBroadcast) {
        const adminBadge = msg.senderRole === 'Teacher/Admin'
            ? '<span class="admin-badge"><i class="fas fa-star"></i> Admin</span>'
            : '';
        metaHtml = `<div class="message-meta"><span class="sender-name">${escapeHTML(msg.senderName)}</span>${adminBadge}</div>`;
    }

    let bubbleContent = '';
    if (isSystem) {
        bubbleContent = `<div class="bubble system-bubble">${escapeHTML(msg.content)}</div>`;
    } else if (msg.type === 'announcement') {
        bubbleContent = `
            <div class="bubble announcement-bubble" style="background:#3498db22; border:1px solid #3498db; border-radius:8px; padding:12px;">
                <div style="font-weight:bold; color:#3498db; margin-bottom:4px;"><i class="fas fa-bullhorn"></i> Announcement from ${escapeHTML(msg.senderName)}</div>
                ${escapeHTML(msg.content)}
            </div>
        `;
    } else if (msg.type === 'poll') {
        const poll = msg.poll;
        const totalVotes = poll.options.reduce((sum, opt) => sum + opt.votes.length, 0);
        let optionsHtml = '';
        poll.options.forEach((opt, idx) => {
            const pct = totalVotes > 0 ? Math.round((opt.votes.length / totalVotes) * 100) : 0;
            const hasVoted = opt.votes.includes(myProfile.id);
            optionsHtml += `
                <div class="poll-option ${hasVoted ? 'voted' : ''}" onclick="window.votePoll('${poll.id}', ${idx})" style="margin-top:6px; background:var(--surface-3); border-radius:4px; padding:6px 10px; cursor:pointer; position:relative; overflow:hidden;">
                    <div style="position:absolute; left:0; top:0; bottom:0; width:${pct}%; background:#9b59b644; z-index:0; transition:width 0.3s;"></div>
                    <div style="position:relative; z-index:1; display:flex; justify-content:space-between; font-size:0.9rem;">
                        <span>${escapeHTML(opt.text)}</span>
                        <span style="color:var(--mist-gray); font-size:0.8rem;">${opt.votes.length} (${pct}%)</span>
                    </div>
                </div>
            `;
        });
        bubbleContent = `
            <div class="bubble poll-bubble" id="poll-${poll.id}" style="background:var(--surface-2); border:1px solid #9b59b6; border-radius:8px; padding:12px; min-width:240px;">
                <div style="font-weight:bold; color:#9b59b6; margin-bottom:8px;"><i class="fas fa-poll"></i> Live Poll</div>
                <div style="margin-bottom:8px;">${escapeHTML(poll.question)}</div>
                <div class="poll-options-container">${optionsHtml}</div>
                <div style="font-size:0.75rem; color:var(--mist-gray); text-align:right; margin-top:8px;">Total votes: ${totalVotes}</div>
            </div>
        `;
    } else if (msg.type === 'file') {
        bubbleContent = buildFileBubble(msg, isSelf);
    } else {
        bubbleContent = `<div class="bubble ${isSelf ? 'sent' : 'received'}" ${!isSelf ? `style="${getBubbleStyle(msg.senderName)}"` : ''}>${escapeHTML(msg.content)}</div>`;
    }

    // Reaction Button UI for non-system messages
    let reactionHtml = '';
    if (!isSystem && msg.id) {
        reactionHtml = `
            <div class="reaction-btn" onclick="window.toggleReactionMenu('${msg.id}', event)"><i class="fas fa-smile"></i></div>
            <div class="reaction-menu" id="reaction-menu-${msg.id}">
                <span onclick="window.addReaction('${msg.id}', '👍', event)">👍</span>
                <span onclick="window.addReaction('${msg.id}', '❤️', event)">❤️</span>
                <span onclick="window.addReaction('${msg.id}', '😂', event)">😂</span>
                <span onclick="window.addReaction('${msg.id}', '❓', event)">❓</span>
            </div>
            <div class="reactions-container" id="reactions-${msg.id}"></div>
        `;
    }

    // Read receipt for our own messages
    let receiptHtml = '';
    if (isSelf && !isSystem && msg.id) {
        receiptHtml = `<span class="read-receipt" id="receipt-${msg.id}">✓</span>`;
    }

    wrapper.innerHTML = `${metaHtml}${bubbleContent}${reactionHtml}<div class="message-time">${msg.timestamp || ''}${receiptHtml}</div>`;
    container.appendChild(wrapper);

    // Setup intersection observer for read receipts on received messages
    if (!isSelf && !isSystem && msg.id) {
        observeMessageForReadReceipt(wrapper, msg.id);
    }
}

// ─── Reactions & Read Receipts Helpers ───────────────────────────────────────
window.toggleReactionMenu = (msgId, e) => {
    e.stopPropagation();
    const menu = document.getElementById(`reaction-menu-${msgId}`);
    if (menu) menu.classList.toggle('open');
};

window.addReaction = (msgId, emoji, e) => {
    e.stopPropagation();
    const menu = document.getElementById(`reaction-menu-${msgId}`);
    if (menu) menu.classList.remove('open');
    socket.emit('reaction_add', { messageId: msgId, emoji, channel: activeChannel });
};

// Close all reaction menus on outside click
document.addEventListener('click', () => {
    document.querySelectorAll('.reaction-menu.open').forEach(menu => menu.classList.remove('open'));
});

// Observer to trigger message_read when message comes into view
const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const msgId = entry.target.dataset.id;
            if (msgId) {
                socket.emit('message_read', { messageId: msgId, channel: activeChannel });
                obs.unobserve(entry.target);
            }
        }
    });
}, { threshold: 0.5 });

function observeMessageForReadReceipt(element, msgId) {
    observer.observe(element);
}


function buildFileBubble(msg, isSelf) {
    const f = msg.file;
    const bubbleClass = isSelf ? 'sent' : 'received';
    const styleAttr = !isSelf ? `style="${getBubbleStyle(msg.senderName)}"` : '';

    if (f.mimetype && f.mimetype.startsWith('image/')) {
        // Fix #4: Use data attributes + addEventListener instead of inline onclick to avoid XSS
        const wrapper = document.createElement('div');
        wrapper.className = `bubble ${bubbleClass}`;
        if (!isSelf) wrapper.setAttribute('style', getBubbleStyle(msg.senderName));
        const img = document.createElement('img');
        img.src = escapeHTML(f.url);
        img.alt = escapeHTML(f.originalName);
        img.className = 'message-image';
        img.addEventListener('click', () => openImageModal(f.url, f.originalName));
        const meta = document.createElement('div');
        meta.className = 'file-attachment';
        meta.innerHTML = `
            <i class="fas fa-image file-attachment-icon"></i>
            <div class="file-attachment-info">
                <div class="file-attachment-name">${escapeHTML(f.originalName)}</div>
                <div class="file-attachment-size">${formatFileSize(f.size)}</div>
            </div>`;
        wrapper.appendChild(img);
        wrapper.appendChild(meta);
        return wrapper.outerHTML;
    }

    return `
        <div class="bubble ${bubbleClass}" ${styleAttr}>
            <a href="${escapeHTML(f.url)}" download="${escapeHTML(f.originalName)}" class="file-attachment" ${isNativeApp() ? `onclick="window.downloadNativeFile('${escapeHTML(f.url)}', '${escapeHTML(f.originalName)}', event)"` : ''}>
                <i class="fas ${getFileIcon(f.mimetype)} file-attachment-icon"></i>
                <div class="file-attachment-info">
                    <div class="file-attachment-name">${escapeHTML(f.originalName)}</div>
                    <div class="file-attachment-size">${formatFileSize(f.size)}</div>
                </div>
                <i class="fas fa-download" style="opacity:0.6;margin-left:auto;"></i>
            </a>
        </div>`;
}

// Image modal
window.openImageModal = function (src, alt) {
    const modal = document.createElement('div');
    modal.className = 'image-modal';
    modal.innerHTML = `<img src="${src}" alt="${escapeHTML(alt)}">`;
    modal.addEventListener('click', () => modal.remove());
    document.body.appendChild(modal);
};

// ═══════════════════════════════════════════════════════════════
// RENDER: User List
// ═══════════════════════════════════════════════════════════════
function renderUserList() {
    const list = document.getElementById('users-list');
    if (!list) return;
    list.innerHTML = '';

    connectedUsers.forEach(u => {
        if (u.id === myProfile.id) return;

        const li = document.createElement('li');
        li.className = `user-item ${activeChannel === u.id ? 'active' : ''}`;

        // BUG-2 fix: Build the DOM with proper event delegation
        // The clickable area for private chat is the info section
        const dot = document.createElement('div');
        dot.className = 'user-online-dot';

        const info = document.createElement('div');
        info.className = 'user-item-info';
        info.style.cursor = 'pointer';
        info.style.flex = '1';
        info.style.minWidth = '0';
        info.innerHTML = `
            <div class="user-item-name">${escapeHTML(u.nickname)}</div>
            <div class="user-item-role">${escapeHTML(u.role)}</div>
        `;

        // Click handler on the info section — opens private chat
        const openChat = () => {
            const stillOnline = connectedUsers.some(cu => cu.id === u.id);
            if (!stillOnline) {
                showToast('User Offline', `${u.nickname} has left the session.`);
                return;
            }
            switchChannel(u.id, u.nickname, u.role, 'private');
            if (isNativeApp()) {
                const chatNavBtn = document.querySelector('.bottom-nav .nav-item[data-tab="chat"]');
                if (chatNavBtn) chatNavBtn.click();
            } else if (window.innerWidth <= 767) {
                closeMobileSidebar();
            }
        };
        dot.addEventListener('click', openChat);
        info.addEventListener('click', openChat);

        li.appendChild(dot);
        li.appendChild(info);

        // Add admin actions button for teachers (does NOT block chat click)
        if (myProfile.role === 'Teacher/Admin' && u.role !== 'Teacher/Admin') {
            const adminBtn = document.createElement('div');
            adminBtn.className = 'user-item-admin-actions';
            adminBtn.style.cssText = 'margin-left:auto; position:relative; padding:4px 8px;';
            adminBtn.innerHTML = `
                <button popovertarget="user-menu-${u.id}" style="background:none; border:none; cursor:pointer;">
                    <i class="fas fa-ellipsis-v" style="color:var(--mist-gray);"></i>
                </button>
                <div class="user-menu" id="user-menu-${u.id}" popover style="background:var(--surface-3); border-radius:8px; padding:4px 0; min-width:110px; box-shadow:0 4px 16px rgba(0,0,0,0.5); border:1px solid var(--border-subtle); margin:0;">
                    <div class="user-menu-item" data-action="mute" style="cursor:pointer; padding:8px 14px; color:#f39c12; font-size:0.85rem; transition:background 0.15s;"><i class="fas fa-microphone-slash me-2"></i>Mute</div>
                    <div class="user-menu-item" data-action="unmute" style="cursor:pointer; padding:8px 14px; color:#2ecc71; font-size:0.85rem; transition:background 0.15s;"><i class="fas fa-microphone me-2"></i>Unmute</div>
                    <div class="user-menu-item" data-action="kick" style="cursor:pointer; padding:8px 14px; color:#e74c3c; font-size:0.85rem; transition:background 0.15s;"><i class="fas fa-sign-out-alt me-2"></i>Kick</div>
                </div>
            `;
            // Delegate clicks within the menu
            adminBtn.querySelectorAll('.user-menu-item').forEach(item => {
                item.addEventListener('click', (e) => {
                    const action = item.dataset.action;
                    if (action === 'mute') socket.emit('mute_user', u.id);
                    else if (action === 'unmute') socket.emit('unmute_user', u.id);
                    else if (action === 'kick') socket.emit('kick_user', u.id);
                    document.getElementById(`user-menu-${u.id}`).hidePopover();
                });
            });
            li.appendChild(adminBtn);
        }

        list.appendChild(li);
    });

    const total = connectedUsers.length || 0;
    const countEl = document.getElementById('online-count');
    const sidebarCountEl = document.getElementById('sidebar-online-count');
    if (countEl) countEl.textContent = `${total} online`;
    if (sidebarCountEl) sidebarCountEl.textContent = `${total} online`;
}
// ═══════════════════════════════════════════════════════════════
// TOAST NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════
function showToast(title, body) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
        <i class="fas fa-bell toast-icon"></i>
        <div class="toast-body">
            <div class="toast-title">${escapeHTML(title)}</div>
            <div class="toast-text">${escapeHTML(body)}</div>
        </div>
        <button class="toast-close"><i class="fas fa-xmark"></i></button>
    `;
    toast.querySelector('.toast-close').addEventListener('click', () => toast.remove());
    container.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s'; setTimeout(() => toast.remove(), 350); }, 5000);
}

// ─── iOS Install Instructions Modal ──────────────────────────────────────────
function showIOSInstallModal() {
    const modal = document.createElement('div');
    modal.className = 'image-modal';
    modal.style.cursor = 'default';
    modal.innerHTML = `
        <div style="background:var(--surface-2);border-radius:1.5rem;padding:2rem;max-width:340px;text-align:center;">
            <i class="fas fa-mobile-screen-button" style="font-size:2.5rem;color:var(--firefly-coral);margin-bottom:1rem;display:block;"></i>
            <h3 style="color:var(--moonlight);margin-bottom:0.75rem;font-size:1.1rem;">Install LAN Chat</h3>
            <p style="color:var(--mist-gray);font-size:0.9rem;line-height:1.5;margin-bottom:1.5rem;">
                Tap the <strong style="color:var(--moonlight);">Share</strong> button
                <i class="fas fa-arrow-up-from-bracket" style="color:var(--firefly-coral);"></i>
                at the bottom of Safari, then tap
                <strong style="color:var(--moonlight);">"Add to Home Screen"</strong>.
            </p>
            <button style="padding:0.6rem 1.5rem;background:var(--firefly-coral);border:none;border-radius:0.6rem;color:white;font-weight:600;cursor:pointer;font-size:0.9rem;"
                onclick="this.closest('.image-modal').remove()">Got it</button>
        </div>
    `;
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
    document.body.appendChild(modal);
}

// ═══════════════════════════════════════════════════════════════
// SOCKET LISTENERS
// ═══════════════════════════════════════════════════════════════
function setupSocketListeners() {

    // Fix #1: Server sends role via join_success — apply it here, never client-side
    socket.on('join_success', ({ role, nickname }) => {
        myProfile.role = role;
        document.getElementById('sidebar-role').textContent = role;
        if (role === 'Teacher/Admin') {
            document.getElementById('admin-controls').style.display = 'block';
            
            if (isNativeApp()) {
                // Show the Admin tab icon
                const navAdminBtn = document.getElementById('nav-admin-btn');
                if (navAdminBtn) navAdminBtn.style.display = 'flex';
                
                // Move Teacher Controls into the Admin Tab
                const adminContent = document.getElementById('admin-tab-content');
                const adminControls = document.getElementById('admin-controls');
                if (adminContent && adminControls) {
                    adminContent.appendChild(adminControls);
                }
            }

            // Teachers don't need student controls
            const studentControls = document.getElementById('student-controls');
            if (studentControls) studentControls.style.display = 'none';
        } else {
            // Students get raise hand, read-only notepad
            const studentControls = document.getElementById('student-controls');
            if (studentControls) studentControls.style.display = 'block';
            const notepad = document.getElementById('class-notepad');
            if (notepad) notepad.readOnly = true;
        }
    });

    socket.on('update_users', (users) => {
        connectedUsers = users;
        renderUserList();
    });

    socket.on('global_message', (msg) => {
        chatHistory['global'].push(msg);
        if (activeChannel === 'global') {
            const container = document.getElementById('messages-container');
            appendMsgToDOM(msg, container);
            container.scrollTop = container.scrollHeight;
        }
        if (msg.senderId !== myProfile.id && audioEnabled) {
            document.getElementById('myAudio').play().catch(() => { });
        }
        triggerNativeNotification(msg);
    });

    socket.on('private_message', (msg) => {
        const threadId = msg.senderId === myProfile.id ? msg.targetId : msg.senderId;
        ensureHistory(threadId);
        chatHistory[threadId].push(msg);

        if (activeChannel === threadId) {
            const container = document.getElementById('messages-container');
            appendMsgToDOM(msg, container);
            container.scrollTop = container.scrollHeight;
        } else if (msg.senderId !== myProfile.id) {
            const preview = msg.type === 'file'
                ? `Sent a file: ${msg.file.originalName}`
                : msg.content.substring(0, 40) + (msg.content.length > 40 ? '…' : '');
            showToast(`New message from ${msg.senderName}`, preview);
            if (audioEnabled) document.getElementById('myAudio').play().catch(() => { });
        }
        triggerNativeNotification(msg);
    });

    socket.on('typing', (data) => {
        const { channel, targetId, nickname } = data;
        const indicator = document.getElementById('typing-indicator');

        // Fix #10: Correctly identify if typing event is for the current view
        const isGlobalMatch = channel === 'global' && activeChannel === 'global';
        // For private: channel = sender's socket ID. The event was sent to us specifically
        // (via io.to(mySocketId)), so if it matches the open thread, show it.
        const isPrivateMatch = activeChannel !== 'global' && activeChannel === channel;

        if (isGlobalMatch || isPrivateMatch) {
            indicator.textContent = `${nickname} is typing…`;
            clearTimeout(remoteTypingTimeout); // Fix #6: use separate inbound timer
            remoteTypingTimeout = setTimeout(() => { indicator.textContent = ''; }, 2000);
        }
    });

    socket.on('session_ended', (data) => {
        alert(`Session Ended\n\n${data.reason}`);
        window.location.reload();
    });

    socket.on('hand_queue_update', (queue) => {
        const list = document.getElementById('hand-queue-list');
        if (!list) return;
        list.innerHTML = '';
        if (queue.length === 0) {
            list.innerHTML = '<li style="color: #7f8c8d; font-size: 0.85rem; padding: 0.5rem;">No hands raised.</li>';
            return;
        }
        queue.forEach((student, index) => {
            const li = document.createElement('li');
            li.className = 'user-item';
            li.style.cursor = 'default';
            li.innerHTML = `
                <div style="font-weight:bold; color:#f39c12; margin-right:8px;">${index + 1}.</div>
                <div class="user-item-info">
                    <div class="user-item-name">${escapeHTML(student.nickname)}</div>
                </div>
                <button onclick="window.callStudent('${student.id}')" style="background:#2ecc71; border:none; border-radius:4px; color:white; padding:4px 8px; cursor:pointer; font-size:0.8rem; margin-left:auto;">Call</button>
            `;
            list.appendChild(li);
        });
    });

    window.callStudent = (id) => {
        socket.emit('call_student', id);
    };

    socket.on('student_called', (data) => {
        showToast('Teacher Called a Student', `${data.teacherName} called on ${data.studentName}`);
        if (audioEnabled) document.getElementById('myAudio').play().catch(() => {});
        // If this student was called, reset their raise hand button
        if (data.studentId === myProfile.id) {
            const textEl = document.getElementById('raise-hand-text');
            const handBtn = document.getElementById('btn-raise-hand');
            if (textEl && handBtn) {
                textEl.textContent = 'Raise Hand';
                handBtn.style.opacity = '1';
            }
        }
    });

    // Notepad Sync
    socket.on('notepad_update', (text) => {
        const notepad = document.getElementById('class-notepad');
        if (notepad && document.activeElement !== notepad) {
            notepad.value = text || '';
        }
    });

    // Polls
    window.votePoll = (pollId, optionIndex) => {
        socket.emit('vote_poll', { pollId, optionIndex });
    };

    socket.on('poll_update', ({ pollId, options }) => {
        const pollBubble = document.getElementById(`poll-${pollId}`);
        if (!pollBubble) return;
        
        const totalVotes = options.reduce((sum, opt) => sum + opt.votes.length, 0);
        let optionsHtml = '';
        options.forEach((opt, idx) => {
            const pct = totalVotes > 0 ? Math.round((opt.votes.length / totalVotes) * 100) : 0;
            const hasVoted = opt.votes.includes(myProfile.id);
            optionsHtml += `
                <div class="poll-option ${hasVoted ? 'voted' : ''}" onclick="window.votePoll('${pollId}', ${idx})" style="margin-top:6px; background:var(--surface-3); border-radius:4px; padding:6px 10px; cursor:pointer; position:relative; overflow:hidden;">
                    <div style="position:absolute; left:0; top:0; bottom:0; width:${pct}%; background:#9b59b644; z-index:0; transition:width 0.3s;"></div>
                    <div style="position:relative; z-index:1; display:flex; justify-content:space-between; font-size:0.9rem;">
                        <span>${escapeHTML(opt.text)}</span>
                        <span style="color:var(--mist-gray); font-size:0.8rem;">${opt.votes.length} (${pct}%)</span>
                    </div>
                </div>
            `;
        });
        
        pollBubble.querySelector('.poll-options-container').innerHTML = optionsHtml;
        const totalEl = pollBubble.querySelector('div:last-child');
        if (totalEl) totalEl.textContent = `Total votes: ${totalVotes}`;
        
        // Update in chat history as well
        Object.values(chatHistory).forEach(thread => {
            const msg = thread.find(m => m.type === 'poll' && m.poll.id === pollId);
            if (msg) msg.poll.options = options;
        });
    });

    socket.on('disconnect', (reason) => {
        document.getElementById('offline-banner').style.display = 'block';
        document.getElementById('messageInp').disabled = true;
        document.querySelector('.send-btn').disabled = true;
    });

    // ─── Reactions & Read Receipts Socket Listeners ───────────────────────────
    socket.on('reaction_add', (data) => {
        const { messageId, emoji, reactorName } = data;
        const container = document.getElementById(`reactions-${messageId}`);
        if (container) {
            // Find existing badge for this emoji
            let badge = Array.from(container.children).find(el => el.dataset.emoji === emoji);
            if (badge) {
                const countEl = badge.querySelector('.reaction-count');
                countEl.textContent = parseInt(countEl.textContent) + 1;
            } else {
                badge = document.createElement('div');
                badge.className = 'reaction-badge';
                badge.dataset.emoji = emoji;
                badge.title = `Reacted by ${reactorName}`;
                badge.innerHTML = `<span>${emoji}</span> <span class="reaction-count">1</span>`;
                container.appendChild(badge);
            }
        }
    });

    socket.on('message_read', (data) => {
        const { messageId } = data;
        const receipt = document.getElementById(`receipt-${messageId}`);
        if (receipt && !receipt.classList.contains('read')) {
            receipt.textContent = '✓✓';
            receipt.classList.add('read');
        }
    });

    // Fix #5: Remove duplicate connect listener — reconnect UI is already handled
    // in the connectAndJoin 'connect' handler's `else` branch.
}

// ─── Visibility change (Mobile Lifecycle) ───
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        if (socket && socket.disconnected) {
            socket.connect();
        }
    }
});
