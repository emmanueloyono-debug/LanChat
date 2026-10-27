// Socket.io connection - automatically detects environment
const BACKEND_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:8080'
    : 'https://chat-app-modified.onrender.com';

console.log('Connecting to backend:', BACKEND_URL);

const socket = io(BACKEND_URL, {
    transports: ['websocket', 'polling'],
    timeout: 20000,
    forceNew: true
});

// Connection event handlers
socket.on('connect', () => {
    console.log('✅ Connected to server:', socket.id);
});

socket.on('connect_error', (error) => {
    console.error('❌ Connection error:', error);
    console.error('Backend URL:', BACKEND_URL);
    console.error('Current origin:', window.location.origin);
});

socket.on('disconnect', (reason) => {
    console.log('🔌 Disconnected:', reason);
});

// DOM Elements
const form = document.getElementById('send-container');
const messageInput = document.getElementById('messageInp');
const messagesContainer = document.getElementById('messages-container');
const welcomeMessage = document.getElementById('welcome-message');
const audio = document.getElementById('myAudio');
const enableAudioButton = document.getElementById('enableAudio');
const onlineCount = document.getElementById('online-count');
const charCount = document.querySelector('.char-count');
const typingIndicator = document.getElementById('typing-indicator');
const emojiBtn = document.getElementById('emoji-btn');
const emojiPicker = document.getElementById('emoji-picker');
const emojiGrid = document.getElementById('emoji-grid');
const fileBtn = document.getElementById('file-btn');
const fileInput = document.getElementById('file-input');
const filePreview = document.getElementById('file-preview');
const previewContent = document.getElementById('preview-content');
const clearFilesBtn = document.getElementById('clear-files');

// Emoji data
const emojiData = {
    smileys: ['😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩', '🥳', '😏'],
    people: ['👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍', '👎', '👊', '✊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '✍️'],
    nature: ['🌟', '⭐', '🌙', '☀️', '⛅', '☁️', '🌈', '🔥', '💧', '❄️', '⚡', '🌸', '🌺', '🌻', '🌹', '🌷', '🌼', '💐', '🌿', '🍀', '🌱', '🌳', '🌲', '🌴', '🌵', '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻'],
    food: ['🍕', '🍔', '🍟', '🌭', '🥪', '🌮', '🌯', '🥙', '🧆', '🥚', '🍳', '🧈', '🥞', '🧇', '🥓', '🥩', '🍗', '🍖', '🦴', '🌶️', '🥕', '🌽', '🥒', '🥬', '🥑', '🍅', '🧄', '🧅', '🥔', '🍠', '🥐', '🍞'],
    activities: ['⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉', '🥏', '🎱', '🪀', '🏓', '🏸', '🏒', '🏑', '🥍', '🏏', '🪃', '🥅', '⛳', '🪁', '🏹', '🎣', '🤿', '🥊', '🥋', '🎽', '🛹', '🛷', '⛸️', '🥌', '🎿'],
    travel: ['✈️', '🚗', '🚕', '🚙', '🚌', '🚎', '🏎️', '🚓', '🚑', '🚒', '🚐', '🛻', '🚚', '🚛', '🚜', '🏍️', '🛵', '🚲', '🛴', '🛹', '🚁', '🛸', '🚀', '🛰️', '💺', '⛵', '🚤', '🛥️', '🛳️', '⛴️', '🚢', '⚓'],
    objects: ['💡', '🔦', '🕯️', '🪔', '🧯', '🛢️', '💸', '💰', '💴', '💵', '💶', '💷', '🪙', '💳', '💎', '⚖️', '🪜', '🧰', '🔧', '🔨', '⛏️', '🪚', '🔩', '⚙️', '🪤', '🧲', '🔫', '💣', '🧨', '🪓', '🔪', '⚔️'],
    symbols: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '☮️', '✝️', '☪️', '🕉️', '☸️', '✡️', '🔯', '🕎', '☯️', '☦️', '🛐', '⛎', '♈']
};

// State variables
let audioEnabled = false;
let currentUser = null;
let onlineUsers = 0;
let isTyping = false;
let typingTimeout;
let emojiPickerOpen = false;
let selectedFiles = [];

// Initialize the application
function initializeApp() {
    // Add a small delay to ensure the page is fully loaded
    setTimeout(() => {
        // Get user name
        currentUser = prompt("👋 Welcome! Please enter your name to join the chat:");

        if (!currentUser || currentUser.trim() === '') {
            currentUser = `User${Math.floor(Math.random() * 1000)}`;
        }

        currentUser = currentUser.trim();

        // Hide welcome message and show chat
        if (welcomeMessage) {
            welcomeMessage.style.display = 'none';
        }

        // Join the chat
        socket.emit('new-user-joined', currentUser);

        // Add welcome message to chat
        appendMessage(`Welcome to ModernChat, ${currentUser}! 🎉`, 'system');
    }, 500); // Wait 500ms to ensure everything is loaded
}

// Emoji Picker Functions
function initializeEmojiPicker() {
    // Populate emoji grid with default category (smileys)
    showEmojiCategory('smileys');

    // Add event listeners for emoji categories
    const categoryButtons = document.querySelectorAll('.emoji-category');
    categoryButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            // Remove active class from all categories
            categoryButtons.forEach(btn => btn.classList.remove('active'));
            // Add active class to clicked category
            e.target.classList.add('active');
            // Show emojis for selected category
            showEmojiCategory(e.target.dataset.category);
        });
    });
}

function showEmojiCategory(category) {
    const emojis = emojiData[category] || emojiData.smileys;
    emojiGrid.innerHTML = ''; emojis.forEach(emoji => {
        const emojiButton = document.createElement('button');
        emojiButton.className = 'emoji-button';
        emojiButton.textContent = emoji;
        emojiButton.addEventListener('click', () => {
            insertEmoji(emoji);
        });
        emojiGrid.appendChild(emojiButton);
    });
}

function insertEmoji(emoji) {
    const cursorPos = messageInput.selectionStart;
    const textBefore = messageInput.value.substring(0, cursorPos);
    const textAfter = messageInput.value.substring(cursorPos);

    messageInput.value = textBefore + emoji + textAfter;
    messageInput.focus();

    // Update cursor position
    const newCursorPos = cursorPos + emoji.length;
    messageInput.setSelectionRange(newCursorPos, newCursorPos);

    // Update character count
    updateCharCount();

    // Close emoji picker
    toggleEmojiPicker(false);
}

function toggleEmojiPicker(show = null) {
    emojiPickerOpen = show !== null ? show : !emojiPickerOpen;

    if (emojiPickerOpen) {
        emojiPicker.style.display = 'block';
        emojiBtn.classList.add('active');
        // Add click outside listener
        setTimeout(() => {
            document.addEventListener('click', handleClickOutside);
        }, 100);
    } else {
        emojiPicker.style.display = 'none';
        emojiBtn.classList.remove('active');
        document.removeEventListener('click', handleClickOutside);
    }
}

function handleClickOutside(event) {
    if (!emojiPicker.contains(event.target) && !emojiBtn.contains(event.target)) {
        toggleEmojiPicker(false);
    }
}

function updateCharCount() {
    const length = messageInput.value.length;
    charCount.textContent = `${length}/500`;

    if (length > 450) {
        charCount.style.color = '#e53e3e';
    } else if (length > 300) {
        charCount.style.color = '#ff8c00';
    } else {
        charCount.style.color = '#a0aec0';
    }
}

// File Upload Functions
function initializeFileUpload() {
    // File button click handler
    fileBtn.addEventListener('click', () => {
        fileInput.click();
    });

    // File input change handler
    fileInput.addEventListener('change', handleFileSelection);

    // Clear files button
    clearFilesBtn.addEventListener('click', clearSelectedFiles);
}

function handleFileSelection(event) {
    const files = Array.from(event.target.files);

    files.forEach(file => {
        if (isValidFile(file)) {
            selectedFiles.push(file);
        }
    });

    updateFilePreview();
    event.target.value = ''; // Reset input
}

function isValidFile(file) {
    const maxSize = 10 * 1024 * 1024; // 10MB
    const allowedTypes = [
        'image/jpeg', 'image/png', 'image/gif', 'image/webp',
        'application/pdf', 'text/plain',
        'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/zip', 'application/x-rar-compressed'
    ];

    if (file.size > maxSize) {
        alert(`File "${file.name}" is too large. Maximum size is 10MB.`);
        return false;
    }

    if (!allowedTypes.includes(file.type)) {
        alert(`File type "${file.type}" is not supported.`);
        return false;
    }

    return true;
}

function updateFilePreview() {
    if (selectedFiles.length === 0) {
        filePreview.style.display = 'none';
        return;
    }

    filePreview.style.display = 'block';
    previewContent.innerHTML = '';

    selectedFiles.forEach((file, index) => {
        const fileItem = createFilePreviewItem(file, index);
        previewContent.appendChild(fileItem);
    });
}

function createFilePreviewItem(file, index) {
    const fileItem = document.createElement('div');
    fileItem.className = 'file-item';

    const icon = getFileIcon(file.type);
    const size = formatFileSize(file.size);

    fileItem.innerHTML = `
        <i class="fas ${icon} file-icon"></i>
        <div class="file-info">
            <div class="file-name" title="${file.name}">${file.name}</div>
            <div class="file-size">${size}</div>
        </div>
        <button type="button" class="file-remove-btn" onclick="removeFile(${index})">
            <i class="fas fa-times"></i>
        </button>
    `;

    return fileItem;
}

function getFileIcon(mimeType) {
    if (mimeType.startsWith('image/')) return 'fa-image';
    if (mimeType === 'application/pdf') return 'fa-file-pdf';
    if (mimeType.includes('word')) return 'fa-file-word';
    if (mimeType === 'text/plain') return 'fa-file-text';
    if (mimeType.includes('zip') || mimeType.includes('rar')) return 'fa-file-archive';
    return 'fa-file';
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function removeFile(index) {
    selectedFiles.splice(index, 1);
    updateFilePreview();
}

function clearSelectedFiles() {
    selectedFiles = [];
    updateFilePreview();
}

async function sendFiles() {
    if (selectedFiles.length === 0) return;

    for (const file of selectedFiles) {
        await sendSingleFile(file);
    }

    clearSelectedFiles();
}

async function sendSingleFile(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = function (e) {
            const fileData = {
                name: file.name,
                type: file.type,
                size: file.size,
                data: e.target.result,
                sender: currentUser
            };

            socket.emit('send-file', fileData);

            // Add to local chat
            appendFileMessage(fileData, 'right');
            resolve();
        };
        reader.readAsDataURL(file);
    });
}

function appendFileMessage(fileData, position, userName = null) {
    const messageElement = document.createElement('div');

    const timeLabel = `<div class="message-time ${position === 'right' ? 'right' : ''}">${formatTime()}</div>`;

    if (position === 'left') {
        messageElement.className = 'message-left';
        if (fileData.type.startsWith('image/')) {
            messageElement.innerHTML = `
                <div class="message-container large">
                    <div class="message-card">
                        <div class="message-card-header">
                            <div class="message-sender-name">${userName}</div>
                        </div>
                        <div class="message-card-content">
                            <img src="${fileData.data}" alt="${fileData.name}" 
                                 class="message-image" 
                                 onclick="openImageModal('${fileData.data}', '${fileData.name}')">
                            <div class="message-text-content">
                                <div class="file-item">
                                    <i class="fas fa-image file-icon"></i>
                                    <div class="file-info">
                                        <div class="file-name">${fileData.name}</div>
                                        <div class="file-size">${formatFileSize(fileData.size)}</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    ${timeLabel}
                </div>
            `;
        } else {
            messageElement.innerHTML = `
                <div class="message-container large">
                    <div class="message-card">
                        <div class="message-card-header">
                            <div class="message-sender-name">${userName}</div>
                        </div>
                        <div class="message-card-content">
                            <a href="${fileData.data}" download="${fileData.name}" class="download-btn file-item">
                                <i class="fas ${getFileIcon(fileData.type)} file-icon"></i>
                                <div class="file-info">
                                    <div class="file-name">${fileData.name}</div>
                                    <div class="file-size">${formatFileSize(fileData.size)}</div>
                                </div>
                                <i class="fas fa-download"></i>
                            </a>
                        </div>
                    </div>
                    ${timeLabel}
                </div>
            `;
        }
    } else if (position === 'right') {
        messageElement.className = 'message-right';
        if (fileData.type.startsWith('image/')) {
            messageElement.innerHTML = `
                <div class="message-container large">
                    <div class="message-card own">
                        <div class="message-card-header">
                            <div class="message-sender-name">${userName}</div>
                        </div>
                        <div class="message-card-content">
                            <img src="${fileData.data}" alt="${fileData.name}" 
                                 class="message-image" 
                                 onclick="openImageModal('${fileData.data}', '${fileData.name}')">
                            <div class="message-text-content">
                                <div class="file-item">
                                    <i class="fas fa-image file-icon"></i>
                                    <div class="file-info">
                                        <div class="file-name">${fileData.name}</div>
                                        <div class="file-size">${formatFileSize(fileData.size)}</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    ${timeLabel}
                </div>
            `;
        } else {
            messageElement.innerHTML = `
                <div class="max-w-xs lg:max-w-md">
                    <div class="gradient-bg rounded-2xl rounded-br-md overflow-hidden shadow-sm">
                        <div class="px-4 py-2 bg-black bg-opacity-10">
                            <div class="font-semibold text-sm text-white opacity-90">${userName}</div>
                        </div>
                        <div class="p-4">
                            <a href="${fileData.data}" download="${fileData.name}" 
                               class="flex items-center gap-3 p-3 bg-white bg-opacity-20 rounded-lg hover:bg-white hover:bg-opacity-30 transition-colors group">
                                <i class="fas ${getFileIcon(fileData.type)} text-lg text-white"></i>
                                <div class="min-w-0 flex-1">
                                    <div class="text-sm font-medium text-white truncate">${fileData.name}</div>
                                    <div class="text-xs text-white opacity-75">${formatFileSize(fileData.size)}</div>
                                </div>
                                <i class="fas fa-download text-white opacity-75 group-hover:opacity-100"></i>
                            </a>
                        </div>
                    </div>
                    ${timeLabel}
                </div>
            `;
        }
    } messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    // Play sound for incoming files
    if (position === 'left' && audioEnabled && audio) {
        audio.play().catch(e => console.log('Audio play failed:', e));
    }

    // Add entrance animation
    messageElement.classList.add('message-enter');
}

function openImageModal(src, alt) {
    // Create modal for full-size image viewing
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.8); display: flex; align-items: center;
        justify-content: center; z-index: 10000; cursor: pointer;
    `;

    const img = document.createElement('img');
    img.src = src;
    img.alt = alt;
    img.style.cssText = 'max-width: 90%; max-height: 90%; border-radius: 8px;';

    modal.appendChild(img);
    document.body.appendChild(modal);

    modal.addEventListener('click', () => {
        document.body.removeChild(modal);
    });
}

// Audio control
enableAudioButton.addEventListener('click', () => {
    audioEnabled = !audioEnabled;

    const icon = enableAudioButton.querySelector('i');
    const text = enableAudioButton.querySelector('span');

    if (audioEnabled) {
        // Add active state styling
        enableAudioButton.className = 'flex items-center space-x-2 px-3 py-2 bg-primary-500 text-white rounded-xl transition-all duration-300 transform hover:-translate-y-0.5';
        icon.className = 'fas fa-volume-up';
        if (text) text.textContent = 'Audio On';
        appendMessage('🔊 Audio notifications enabled', 'system');
    } else {
        // Remove active state styling
        enableAudioButton.className = 'flex items-center space-x-2 px-3 py-2 border-2 border-primary-500 text-primary-500 rounded-xl hover:bg-primary-500 hover:text-white transition-all duration-300 transform hover:-translate-y-0.5';
        icon.className = 'fas fa-volume-mute';
        if (text) text.textContent = 'Audio Off';
        appendMessage('🔇 Audio notifications disabled', 'system');
    }
});

// Emoji button event listener
emojiBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleEmojiPicker();
});

// Character counter and typing indicator
messageInput.addEventListener('input', () => {
    updateCharCount();

    // Handle typing indicator
    const length = messageInput.value.length;
    if (!isTyping && length > 0) {
        isTyping = true;
        socket.emit('typing', { user: currentUser, typing: true });
    }

    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        if (isTyping) {
            isTyping = false;
            socket.emit('typing', { user: currentUser, typing: false });
        }
    }, 1000);
});

// Message formatting function
function formatTime() {
    const now = new Date();
    return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Enhanced message appending function
function appendMessage(message, position, userName = null, showTime = true) {
    const messageElement = document.createElement('div');

    // Add Tailwind classes based on message position
    if (position === 'system') {
        messageElement.className = 'flex justify-center mb-4';
        messageElement.innerHTML = `
            <div class="bg-gray-100 text-gray-600 px-4 py-2 rounded-full text-sm italic max-w-xs text-center">
                ${message}
            </div>
        `;
    } else if (position === 'left') {
        messageElement.className = 'flex justify-start mb-4';
        const timeLabel = showTime ? `<div class="text-xs text-gray-400 mt-1">${formatTime()}</div>` : '';
        messageElement.innerHTML = `
            <div class="max-w-xs lg:max-w-md">
                <div class="bg-white border border-gray-200 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
                    <div class="font-semibold text-sm text-gray-800 mb-1">${userName}</div>
                    <div class="text-gray-700">${message}</div>
                </div>
                ${timeLabel}
            </div>
        `;
    } else if (position === 'right') {
        messageElement.className = 'flex justify-end mb-4';
        const timeLabel = showTime ? `<div class="text-xs text-gray-400 mt-1 text-right">${formatTime()}</div>` : '';
        messageElement.innerHTML = `
            <div class="max-w-xs lg:max-w-md">
                <div class="gradient-bg rounded-2xl rounded-br-md px-4 py-3 text-white shadow-sm">
                    <div class="font-semibold text-sm opacity-90 mb-1">${userName}</div>
                    <div>${message}</div>
                </div>
                ${timeLabel}
            </div>
        `;
    }

    messagesContainer.appendChild(messageElement);

    // Auto-scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    // Play sound for incoming messages
    if (position === 'left' && audioEnabled && audio) {
        audio.play().catch(e => console.log('Audio play failed:', e));
    }

    // Add entrance animation
    messageElement.classList.add('message-enter');
}

// Form submission
if (form) {
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const message = messageInput.value.trim();
        const hasFiles = selectedFiles.length > 0;

        if (!message && !hasFiles) return;

        // Clear typing indicator
        if (isTyping) {
            isTyping = false;
            socket.emit('typing', { user: currentUser, typing: false });
        }

        // Send files first if any
        if (hasFiles) {
            await sendFiles();
        }

        // Send text message if any
        if (message) {
            // Add message to UI
            appendMessage(message, 'right', 'You');

            // Send message to server
            socket.emit('send', message);

            // Clear input
            messageInput.value = '';
            updateCharCount();
        }

        // Add send animation to button
        const sendBtn = form.querySelector('.send-btn');
        sendBtn.style.transform = 'scale(0.95)';
        setTimeout(() => {
            sendBtn.style.transform = 'scale(1)';
        }, 150);
    });
} else {
    console.error("Form element 'send-container' not found.");
}

// Socket event listeners
socket.on('user-joined', (name) => {
    appendMessage(`${name} joined the chat! 👋`, 'system');
    onlineUsers++;
    updateOnlineCount();
});

socket.on('receive', (data) => {
    appendMessage(data.message, 'left', data.name);
});

socket.on('receive-file', (fileData) => {
    appendFileMessage(fileData, 'left', fileData.sender);
});

socket.on('dis', (data) => {
    appendMessage(`${data.name} left the chat 👋`, 'system');
    onlineUsers = Math.max(0, onlineUsers - 1);
    updateOnlineCount();
});

socket.on('typing', (data) => {
    if (data.user !== currentUser) {
        if (data.typing) {
            typingIndicator.textContent = `${data.user} is typing...`;
        } else {
            typingIndicator.textContent = '';
        }
    }
});

socket.on('online-count', (count) => {
    onlineUsers = count;
    updateOnlineCount();
});

socket.on('connect', () => {
    console.log('Connected to server');
    appendMessage('Connected to server! 🌐', 'system');
});

socket.on('disconnect', () => {
    console.log('Disconnected from server');
    appendMessage('Connection lost. Attempting to reconnect... 🔄', 'system');
});

socket.on('reconnect', () => {
    console.log('Reconnected to server');
    appendMessage('Reconnected successfully! ✅', 'system');
});

// Update online count display
function updateOnlineCount() {
    if (onlineCount) {
        const text = onlineUsers === 1 ? '1 user online' : `${onlineUsers} users online`;
        onlineCount.textContent = text;
    }
}

// Enhanced enter key handling
messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        form.dispatchEvent(new Event('submit'));
    }
});

// Initialize the app when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initializeApp();
        initializeEmojiPicker();
        initializeFileUpload();
    });
} else {
    initializeApp();
    initializeEmojiPicker();
    initializeFileUpload();
}

// Global function for removing files (called from onclick)
window.removeFile = removeFile;