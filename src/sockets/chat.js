const crypto = require('crypto');

// ─── Constants ────────────────────────────────────────────────────────────────
const INACTIVITY_LIMIT = 45 * 60 * 1000; // 45 minutes
const MESSAGE_RATE_LIMIT = 20; // messages per window
const MESSAGE_RATE_WINDOW = 10000; // 10 seconds
const MAX_MESSAGE_LENGTH = 500;
const MAX_ANNOUNCEMENT_LENGTH = 1000;
const MAX_POLL_QUESTION_LENGTH = 300;
const MAX_POLL_OPTION_LENGTH = 100;
const MAX_POLL_OPTIONS = 5;
const MAX_NOTEPAD_LENGTH = 10000;
const MAX_NICKNAME_LENGTH = 30;

// ─── State ────────────────────────────────────────────────────────────────────
let connectedUsers = {};
let handQueue = []; // array of socket IDs
let mutedUsers = new Set(); // set of socket IDs
let activePolls = {}; // { pollId: { question, options, creatorId, timestamp } }
let sharedNotepadText = "";
let globalChatHistory = []; // Server-side global chat archive

// Message rate limiting state
const userMessageTimestamps = {};

const checkRateLimit = (socketId) => {
  const now = Date.now();
  if (!userMessageTimestamps[socketId]) {
    userMessageTimestamps[socketId] = [];
  }
  userMessageTimestamps[socketId] = userMessageTimestamps[socketId].filter(ts => now - ts < MESSAGE_RATE_WINDOW);
  if (userMessageTimestamps[socketId].length >= MESSAGE_RATE_LIMIT) {
    return false; // Rate limit exceeded
  }
  userMessageTimestamps[socketId].push(now);
  return true; // OK
};

// ─── Export function for server.js chat export endpoint ────────────────────────
const getChatHistory = () => globalChatHistory;

module.exports = (io, app) => {

  // ─── Per-User Inactivity Timer ──────────────────────────────────────────────
  const resetUserTimer = (socketId) => {
    try {
      const user = connectedUsers[socketId];
      if (!user) return;

      if (user.inactivityTimer) clearTimeout(user.inactivityTimer);

      user.inactivityTimer = setTimeout(() => {
        const sock = io.sockets.sockets.get(socketId);
        if (sock && connectedUsers[socketId]) {
          console.log(`[INACTIVITY] ${connectedUsers[socketId].nickname} disconnected after 45 min of inactivity.`);
          sock.emit('session_ended', { reason: 'You were disconnected due to 45 minutes of inactivity.' });
          sock.disconnect(true);
        }
      }, INACTIVITY_LIMIT);
    } catch (err) {
      console.error('[resetUserTimer] Error:', err);
    }
  };

  // ─── Socket-level rate limiting middleware ───────────────────────────────────
  io.use((socket, next) => {
    // Basic connection-level validation
    const origin = socket.handshake.headers.origin || '';
    // Allow all LAN origins and capacitor
    if (origin && !origin.startsWith('http://') && !origin.startsWith('https://') && !origin.startsWith('capacitor://')) {
      return next(new Error('Invalid origin'));
    }
    next();
  });

  io.on('connection', (socket) => {
    console.log(`[CONNECT] ${socket.id}`);

    // ─── Join ───────────────────────────────────────────────────────────────────
    socket.on('join', (data) => {
      try {
        const { nickname, password } = data;

        // Validate nickname
        if (!nickname || typeof nickname !== 'string' || nickname.trim().length === 0) {
          socket.emit('join_error', { message: 'Invalid nickname.' });
          return;
        }

        const cleanNick = nickname.trim().substring(0, MAX_NICKNAME_LENGTH);
        
        // Duplicate nickname prevention
        const isDuplicate = Object.values(connectedUsers).some(u => u.nickname.toLowerCase() === cleanNick.toLowerCase());
        if (isDuplicate) {
          socket.emit('join_error', { message: 'Nickname is already taken. Please choose another.' });
          return;
        }

        const role = password === process.env.TEACHER_PASSWORD ? 'Teacher/Admin' : 'Student';

        connectedUsers[socket.id] = { id: socket.id, nickname: cleanNick, role };
        resetUserTimer(socket.id);

        // Generate session token for authenticated uploads
        let sessionToken = null;
        if (app && app.locals.generateSessionToken) {
          sessionToken = app.locals.generateSessionToken(socket.id, cleanNick, role);
        }

        // Send role and token back to client
        socket.emit('join_success', { role, nickname: cleanNick, sessionToken });

        // Clean up from state if reconnecting
        mutedUsers.delete(socket.id);
        handQueue = handQueue.filter(id => id !== socket.id);

        const userList = Object.values(connectedUsers).map(u => ({ id: u.id, nickname: u.nickname, role: u.role }));
        io.emit('update_users', userList);
        io.emit('hand_queue_update', handQueue.map(id => ({ id, nickname: connectedUsers[id]?.nickname })));
        socket.emit('notepad_update', sharedNotepadText); // send current notepad state
        
        // Send recent chat history to the joining user (last 50 messages)
        const recentHistory = globalChatHistory.slice(-50);
        if (recentHistory.length > 0) {
          socket.emit('chat_history', recentHistory);
        }

        console.log(`[JOIN] ${cleanNick} (${role})`);
      } catch (err) {
        console.error('[join] Error:', err);
      }
    });

    // ─── Global Message ─────────────────────────────────────────────────────────
    socket.on('global_message', (msgContent) => {
      try {
        if (mutedUsers.has(socket.id)) {
          socket.emit('error_message', { message: 'You have been muted by the teacher.' });
          return;
        }
        if (!checkRateLimit(socket.id)) {
          socket.emit('error_message', { message: 'You are sending messages too fast. Please slow down.' });
          return;
        }
        resetUserTimer(socket.id);
        const user = connectedUsers[socket.id];
        if (!user || typeof msgContent !== 'string') return;

        const message = {
          id: crypto.randomUUID(),
          senderId: socket.id,
          senderName: user.nickname,
          senderRole: user.role,
          content: msgContent.trim().substring(0, MAX_MESSAGE_LENGTH),
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          type: 'text'
        };
        
        globalChatHistory.push(message);
        // Keep server history capped at 500 messages
        if (globalChatHistory.length > 500) {
          globalChatHistory = globalChatHistory.slice(-500);
        }
        
        io.emit('global_message', message);
      } catch (err) {
        console.error('[global_message] Error:', err);
      }
    });

    // ─── Global File Message ────────────────────────────────────────────────────
    socket.on('global_file', (filePayload) => {
      try {
        if (mutedUsers.has(socket.id)) {
          socket.emit('error_message', { message: 'You have been muted by the teacher.' });
          return;
        }
        resetUserTimer(socket.id);
        const user = connectedUsers[socket.id];
        if (!user || !filePayload || !filePayload.url) return;

        const message = {
          id: crypto.randomUUID(),
          senderId: socket.id,
          senderName: user.nickname,
          senderRole: user.role,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          type: 'file',
          file: {
            url: filePayload.url,
            originalName: filePayload.originalName,
            mimetype: filePayload.mimetype,
            size: filePayload.size
          }
        };
        
        globalChatHistory.push(message);
        if (globalChatHistory.length > 500) {
          globalChatHistory = globalChatHistory.slice(-500);
        }
        
        io.emit('global_message', message);
      } catch (err) {
        console.error('[global_file] Error:', err);
      }
    });

    // ─── Private Message ────────────────────────────────────────────────────────
    socket.on('private_message', (data) => {
      try {
        if (mutedUsers.has(socket.id)) {
          socket.emit('error_message', { message: 'You have been muted by the teacher.' });
          return;
        }
        if (!checkRateLimit(socket.id)) {
          socket.emit('error_message', { message: 'You are sending messages too fast. Please slow down.' });
          return;
        }
        resetUserTimer(socket.id);
        const { targetId, content } = data;
        const sender = connectedUsers[socket.id];
        if (!sender || !connectedUsers[targetId] || typeof content !== 'string') return;

        const message = {
          id: crypto.randomUUID(),
          senderId: socket.id,
          senderName: sender.nickname,
          senderRole: sender.role,
          targetId,
          content: content.trim().substring(0, MAX_MESSAGE_LENGTH),
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          type: 'text'
        };
        io.to(targetId).emit('private_message', message);
        socket.emit('private_message', message);
      } catch (err) {
        console.error('[private_message] Error:', err);
      }
    });

    // ─── Private File Message ───────────────────────────────────────────────────
    socket.on('private_file', (data) => {
      try {
        if (mutedUsers.has(socket.id)) {
          socket.emit('error_message', { message: 'You have been muted by the teacher.' });
          return;
        }
        resetUserTimer(socket.id);
        const { targetId, filePayload } = data;
        const sender = connectedUsers[socket.id];
        if (!sender || !connectedUsers[targetId] || !filePayload || !filePayload.url) return;

        const message = {
          id: crypto.randomUUID(),
          senderId: socket.id,
          senderName: sender.nickname,
          senderRole: sender.role,
          targetId,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          type: 'file',
          file: filePayload
        };
        io.to(targetId).emit('private_message', message);
        socket.emit('private_message', message);
      } catch (err) {
        console.error('[private_file] Error:', err);
      }
    });

    // ─── Typing ─────────────────────────────────────────────────────────────────
    socket.on('typing', (data) => {
      try {
        const { channel } = data;
        const user = connectedUsers[socket.id];
        if (!user) return;

        if (channel === 'global') {
          socket.broadcast.emit('typing', { channel: 'global', nickname: user.nickname });
        } else {
          io.to(channel).emit('typing', {
            channel: socket.id,
            targetId: channel,
            nickname: user.nickname
          });
        }
      } catch (err) {
        console.error('[typing] Error:', err);
      }
    });

    // ─── Admin: End Session ─────────────────────────────────────────────────────
    socket.on('end_session', () => {
      try {
        const user = connectedUsers[socket.id];
        if (!user || user.role !== 'Teacher/Admin') return;

        console.log(`[ADMIN] ${user.nickname} ended the session.`);
        // Clear all per-user timers before wiping
        for (const uid of Object.keys(connectedUsers)) {
          if (connectedUsers[uid].inactivityTimer) clearTimeout(connectedUsers[uid].inactivityTimer);
        }
        connectedUsers = {};
        mutedUsers.clear();
        handQueue = [];
        activePolls = {};
        sharedNotepadText = "";
        globalChatHistory = [];
        
        // Clear session tokens
        if (app && app.locals.sessionTokens) {
          app.locals.sessionTokens.clear();
        }
        
        io.emit('session_ended', { reason: 'The Teacher has ended the class session.' });
      } catch (err) {
        console.error('[end_session] Error:', err);
      }
    });

    // ─── Teacher Announcements ──────────────────────────────────────────────────
    socket.on('announcement', (content) => {
      try {
        const user = connectedUsers[socket.id];
        if (!user || user.role !== 'Teacher/Admin' || typeof content !== 'string') return;
        
        const message = {
          id: crypto.randomUUID(),
          senderId: socket.id,
          senderName: user.nickname,
          senderRole: user.role,
          content: content.trim().substring(0, MAX_ANNOUNCEMENT_LENGTH),
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          type: 'announcement'
        };
        
        globalChatHistory.push(message);
        if (globalChatHistory.length > 500) {
          globalChatHistory = globalChatHistory.slice(-500);
        }
        
        io.emit('global_message', message);
      } catch (err) {
        console.error('[announcement] Error:', err);
      }
    });

    // ─── Raise Hand Queue ───────────────────────────────────────────────────────
    socket.on('raise_hand', () => {
      try {
        const user = connectedUsers[socket.id];
        if (!user || user.role === 'Teacher/Admin') return;
        
        if (!handQueue.includes(socket.id)) {
          handQueue.push(socket.id);
          io.emit('hand_queue_update', handQueue.map(id => ({ id, nickname: connectedUsers[id]?.nickname })));
        }
      } catch (err) {
        console.error('[raise_hand] Error:', err);
      }
    });

    socket.on('lower_hand', () => {
      try {
        if (handQueue.includes(socket.id)) {
          handQueue = handQueue.filter(id => id !== socket.id);
          io.emit('hand_queue_update', handQueue.map(id => ({ id, nickname: connectedUsers[id]?.nickname })));
        }
      } catch (err) {
        console.error('[lower_hand] Error:', err);
      }
    });

    socket.on('call_student', (studentId) => {
      try {
        const teacher = connectedUsers[socket.id];
        if (!teacher || teacher.role !== 'Teacher/Admin') return;
        
        const student = connectedUsers[studentId];
        if (student && handQueue.includes(studentId)) {
          handQueue = handQueue.filter(id => id !== studentId);
          io.emit('hand_queue_update', handQueue.map(id => ({ id, nickname: connectedUsers[id]?.nickname })));
          io.emit('student_called', { studentId, studentName: student.nickname, teacherName: teacher.nickname });
        }
      } catch (err) {
        console.error('[call_student] Error:', err);
      }
    });

    // ─── Mute / Kick (Teacher Controls) ─────────────────────────────────────────
    socket.on('mute_user', (targetId) => {
      try {
        const teacher = connectedUsers[socket.id];
        if (!teacher || teacher.role !== 'Teacher/Admin') return;
        
        if (connectedUsers[targetId] && connectedUsers[targetId].role !== 'Teacher/Admin') {
          mutedUsers.add(targetId);
          io.to(targetId).emit('error_message', { message: 'You have been muted by the teacher.' });
          socket.emit('error_message', { message: `Muted ${connectedUsers[targetId].nickname}.` });
        }
      } catch (err) {
        console.error('[mute_user] Error:', err);
      }
    });

    socket.on('unmute_user', (targetId) => {
      try {
        const teacher = connectedUsers[socket.id];
        if (!teacher || teacher.role !== 'Teacher/Admin') return;
        
        if (mutedUsers.has(targetId)) {
          mutedUsers.delete(targetId);
          io.to(targetId).emit('error_message', { message: 'You have been unmuted by the teacher.' });
          socket.emit('error_message', { message: `Unmuted ${connectedUsers[targetId].nickname}.` });
        }
      } catch (err) {
        console.error('[unmute_user] Error:', err);
      }
    });

    socket.on('kick_user', (targetId) => {
      try {
        const teacher = connectedUsers[socket.id];
        if (!teacher || teacher.role !== 'Teacher/Admin') return;
        
        const target = io.sockets.sockets.get(targetId);
        if (target && connectedUsers[targetId] && connectedUsers[targetId].role !== 'Teacher/Admin') {
          target.emit('session_ended', { reason: 'You have been removed by the teacher.' });
          target.disconnect(true);
          socket.emit('error_message', { message: `Kicked ${connectedUsers[targetId].nickname}.` });
        }
      } catch (err) {
        console.error('[kick_user] Error:', err);
      }
    });

    // ─── Live Polls ─────────────────────────────────────────────────────────────
    socket.on('create_poll', (data) => {
      try {
        const user = connectedUsers[socket.id];
        if (!user || user.role !== 'Teacher/Admin') return;
        if (!data || !data.question || !Array.isArray(data.options)) return;

        const pollId = crypto.randomUUID();
        const poll = {
          id: pollId,
          question: data.question.substring(0, MAX_POLL_QUESTION_LENGTH),
          options: data.options.slice(0, MAX_POLL_OPTIONS).map(opt => ({ text: String(opt).substring(0, MAX_POLL_OPTION_LENGTH), votes: [] })),
          creatorId: socket.id,
          timestamp: Date.now()
        };
        activePolls[pollId] = poll;

        const message = {
          id: crypto.randomUUID(),
          senderId: socket.id,
          senderName: user.nickname,
          senderRole: user.role,
          type: 'poll',
          poll: poll,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        
        globalChatHistory.push(message);
        if (globalChatHistory.length > 500) {
          globalChatHistory = globalChatHistory.slice(-500);
        }
        
        io.emit('global_message', message);
      } catch (err) {
        console.error('[create_poll] Error:', err);
      }
    });

    socket.on('vote_poll', (data) => {
      try {
        const { pollId, optionIndex } = data;
        const poll = activePolls[pollId];
        if (!poll) return;
        
        // Remove prior vote from this user if they are changing it
        poll.options.forEach(opt => {
          opt.votes = opt.votes.filter(id => id !== socket.id);
        });
        
        // Add new vote
        if (poll.options[optionIndex]) {
          poll.options[optionIndex].votes.push(socket.id);
        }
        
        io.emit('poll_update', { pollId, options: poll.options });
      } catch (err) {
        console.error('[vote_poll] Error:', err);
      }
    });

    // ─── Shared Notepad ─────────────────────────────────────────────────────────
    socket.on('notepad_update', (text) => {
      try {
        const user = connectedUsers[socket.id];
        if (!user || user.role !== 'Teacher/Admin') return;
        sharedNotepadText = String(text).substring(0, MAX_NOTEPAD_LENGTH);
        socket.broadcast.emit('notepad_update', sharedNotepadText);
      } catch (err) {
        console.error('[notepad_update] Error:', err);
      }
    });

    // ─── Reactions & Read Receipts ──────────────────────────────────────────────
    socket.on('reaction_add', (data) => {
      try {
        const { messageId, emoji, channel } = data;
        const user = connectedUsers[socket.id];
        if (!user || !messageId || !emoji) return;

        const reactionData = { messageId, emoji, channel, reactorId: socket.id, reactorName: user.nickname };
        
        if (channel === 'global') {
          io.emit('reaction_add', reactionData);
        } else {
          // Send to the other person in the private chat, and echo back to sender
          io.to(channel).emit('reaction_add', reactionData);
          socket.emit('reaction_add', reactionData);
        }
      } catch (err) {
        console.error('[reaction_add] Error:', err);
      }
    });

    socket.on('message_read', (data) => {
      try {
        const { messageId, channel } = data;
        if (!messageId) return;

        // Note: channel here is the sender of the message who needs the read receipt
        if (channel !== 'global' && connectedUsers[channel]) {
          io.to(channel).emit('message_read', { messageId, readerId: socket.id });
        }
      } catch (err) {
        console.error('[message_read] Error:', err);
      }
    });

    // ─── Message Search ─────────────────────────────────────────────────────────
    socket.on('search_messages', (query) => {
      try {
        if (!query || typeof query !== 'string') return;
        const searchTerm = query.trim().toLowerCase().substring(0, 100);
        if (searchTerm.length < 2) return;

        const results = globalChatHistory
          .filter(msg => {
            if (msg.content && msg.content.toLowerCase().includes(searchTerm)) return true;
            if (msg.senderName && msg.senderName.toLowerCase().includes(searchTerm)) return true;
            if (msg.file && msg.file.originalName && msg.file.originalName.toLowerCase().includes(searchTerm)) return true;
            return false;
          })
          .slice(-20); // Return at most 20 results

        socket.emit('search_results', results);
      } catch (err) {
        console.error('[search_messages] Error:', err);
      }
    });

    // ─── Disconnect ─────────────────────────────────────────────────────────────
    socket.on('disconnect', () => {
      try {
        if (connectedUsers[socket.id]) {
          console.log(`[DISCONNECT] ${connectedUsers[socket.id].nickname}`);
          if (connectedUsers[socket.id].inactivityTimer) {
            clearTimeout(connectedUsers[socket.id].inactivityTimer);
          }
          delete connectedUsers[socket.id];
          delete userMessageTimestamps[socket.id];
          mutedUsers.delete(socket.id);
          handQueue = handQueue.filter(id => id !== socket.id);
          
          // Clean up session tokens for this socket
          if (app && app.locals.sessionTokens) {
            for (const [token, session] of app.locals.sessionTokens) {
              if (session.socketId === socket.id) {
                app.locals.sessionTokens.delete(token);
              }
            }
          }
          
          io.emit('update_users', Object.values(connectedUsers).map(u => ({ id: u.id, nickname: u.nickname, role: u.role })));
          io.emit('hand_queue_update', handQueue.map(id => ({ id, nickname: connectedUsers[id]?.nickname })));
        }
      } catch (err) {
        console.error('[disconnect] Error:', err);
      }
    });
  });
};

// Export getChatHistory for the server export endpoint
module.exports.getChatHistory = getChatHistory;
