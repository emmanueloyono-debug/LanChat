require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const { Server } = require('socket.io');
const helmet = require('helmet');
const multer = require('multer');
const fs = require('fs');
const Bonjour = require('bonjour-service');
const rateLimit = require('express-rate-limit');
const chatSocket = require('./src/sockets/chat');

const app = express();
const server = http.createServer(app);
const PORT = parseInt(process.env.PORT, 10) || 3001;

// ─── Session Token Store ──────────────────────────────────────────────────────
// Maps session tokens to socket IDs for upload authentication
const sessionTokens = new Map(); // token → { socketId, nickname, role, createdAt }
const TOKEN_EXPIRY = 2 * 60 * 60 * 1000; // 2 hours

function generateSessionToken(socketId, nickname, role) {
  const token = crypto.randomBytes(32).toString('hex');
  sessionTokens.set(token, { socketId, nickname, role, createdAt: Date.now() });
  return token;
}

function validateSessionToken(token) {
  const session = sessionTokens.get(token);
  if (!session) return null;
  if (Date.now() - session.createdAt > TOKEN_EXPIRY) {
    sessionTokens.delete(token);
    return null;
  }
  return session;
}

// Expose token functions to socket module
app.locals.generateSessionToken = generateSessionToken;
app.locals.sessionTokens = sessionTokens;

// Clean up expired tokens periodically
setInterval(() => {
  const now = Date.now();
  for (const [token, session] of sessionTokens) {
    if (now - session.createdAt > TOKEN_EXPIRY) {
      sessionTokens.delete(token);
    }
  }
}, 15 * 60 * 1000); // Every 15 minutes

const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingInterval: 25000,
  pingTimeout: 60000
});

// Expose io to chat socket for token generation
app.locals.io = io;

// Shared reference to active socket IDs for upload authentication
const getSocketIds = () => new Set(io.sockets.sockets.keys());

// ─── File Upload Configuration ────────────────────────────────────────────────
// Validate by BOTH MIME type AND file extension to prevent MIME spoofing
const ALLOWED_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp',
  '.pdf', '.txt', '.doc', '.docx',
  '.zip', '.rar'
]);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, 'public', 'uploads'));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uniqueSuffix}${ext}`);
  }
});

const ALLOWED_MIMETYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf', 'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/zip', 'application/x-rar-compressed',
  'application/x-zip-compressed'
]);

// Magic byte signatures for server-side file validation
const FILE_SIGNATURES = {
  'image/jpeg': [Buffer.from([0xFF, 0xD8, 0xFF])],
  'image/png': [Buffer.from([0x89, 0x50, 0x4E, 0x47])],
  'image/gif': [Buffer.from('GIF87a'), Buffer.from('GIF89a')],
  'image/webp': [Buffer.from('RIFF')],
  'application/pdf': [Buffer.from('%PDF')],
  'application/zip': [Buffer.from([0x50, 0x4B, 0x03, 0x04])],
  'application/x-zip-compressed': [Buffer.from([0x50, 0x4B, 0x03, 0x04])],
  'application/x-rar-compressed': [Buffer.from([0x52, 0x61, 0x72, 0x21])]
};

function validateFileSignature(filePath, mimetype) {
  const signatures = FILE_SIGNATURES[mimetype];
  if (!signatures) return true; // No signature check for text/doc files
  try {
    const buffer = Buffer.alloc(8);
    const fd = fs.openSync(filePath, 'r');
    fs.readSync(fd, buffer, 0, 8, 0);
    fs.closeSync(fd);
    return signatures.some(sig => buffer.subarray(0, sig.length).equals(sig));
  } catch {
    return false;
  }
}

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ALLOWED_MIMETYPES.has(file.mimetype) && ALLOWED_EXTENSIONS.has(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`File type not supported. Got MIME "${file.mimetype}" / ext "${ext}".`), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB max per file
  }
});

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'", "ws:", "wss:", "http:", "https:"],
      mediaSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false
}));

// Manual CORS middleware to allow cross-origin requests from Capacitor
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization, x-socket-id");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
// Serve node_modules for local assets
app.use('/assets/fontawesome', express.static(path.join(__dirname, 'node_modules', '@fortawesome', 'fontawesome-free')));
app.use('/assets/inter', express.static(path.join(__dirname, 'node_modules', '@fontsource', 'inter')));
// Serve uploaded files explicitly
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

// ─── Upload Auth Middleware ───────────────────────────────────────────────────
// Accepts either session token (preferred) or socket ID (legacy fallback)
function requireAuth(req, res, next) {
  // Try Authorization header first (session token)
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const session = validateSessionToken(token);
    if (session) {
      req.sessionData = session;
      return next();
    }
  }
  // Legacy fallback: socket ID header
  const socketId = req.headers['x-socket-id'];
  if (socketId && getSocketIds().has(socketId)) {
    return next();
  }
  return res.status(401).json({ error: 'Unauthorized. Valid session required.' });
}

// ─── Health Check Endpoint ────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    onlineUsers: io.sockets.sockets.size,
    timestamp: new Date().toISOString()
  });
});

// ─── Upload Endpoint ──────────────────────────────────────────────────────────
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // limit each IP to 50 requests per windowMs
  message: { error: 'Too many files uploaded from this IP, please try again later.' }
});

app.post('/upload', requireAuth, uploadLimiter, upload.array('files', 5), (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded.' });
    }

    // Server-side file signature validation
    const validFiles = [];
    for (const f of req.files) {
      if (validateFileSignature(f.path, f.mimetype)) {
        validFiles.push({
          url: `/uploads/${f.filename}`,
          originalName: f.originalname,
          mimetype: f.mimetype,
          size: f.size
        });
      } else {
        // Remove the invalid file
        try { fs.unlinkSync(f.path); } catch {}
        console.warn(`[UPLOAD] Rejected file with invalid signature: ${f.originalname} (claimed ${f.mimetype})`);
      }
    }

    if (validFiles.length === 0) {
      return res.status(400).json({ error: 'No valid files passed signature verification.' });
    }

    res.json({ files: validFiles });
  } catch (err) {
    console.error('Upload route error:', err);
    res.status(500).json({ error: 'Upload failed.' });
  }
});

// Multer error handler
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || err.message) {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

// ─── AI Assistant Proxy ───────────────────────────────────────────────────────
const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100, // limit each IP to 100 AI requests per windowMs
  message: { error: 'Too many AI requests from this IP, please try again later.' }
});

app.post('/api/ai', aiLimiter, async (req, res) => {
  try {
    const { message, history } = req.body;
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required.' });
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ error: 'AI service not configured on this server.' });
    }

    const messages = [
      {
        role: 'system',
        content: 'You are a helpful AI tutor assistant integrated into a classroom LAN chat. Be concise, clear, and educational. Help students with their questions.'
      },
      ...(Array.isArray(history) ? history.slice(-10) : []),
      { role: 'user', content: message.substring(0, 2000) }
    ];

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-20b',
        messages,
        max_tokens: 1024,
        temperature: 0.7,
        stream: true // Enable streaming
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[AI] Groq API error:', errText);
      return res.status(502).json({ error: 'AI service returned an error.' });
    }

    // Set headers for Server-Sent Events (SSE)
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Use Web Streams API to forward the stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(decoder.decode(value));
    }
    res.end();

  } catch (err) {
    console.error('[AI] Proxy error:', err.message);
    if (!res.headersSent) {
      res.status(503).json({ error: 'AI service is currently unavailable.' });
    } else {
      res.end();
    }
  }
});

// ─── Chat Export (Teacher Only) ───────────────────────────────────────────────
app.get('/api/export-chat', requireAuth, (req, res) => {
  try {
    const chatModule = require('./src/sockets/chat');
    const history = chatModule.getChatHistory ? chatModule.getChatHistory() : [];
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="chat-export-${Date.now()}.txt"`);

    let output = `LAN Classroom Chat Export\nDate: ${new Date().toISOString()}\n${'='.repeat(50)}\n\n`;
    history.forEach(msg => {
      output += `[${msg.timestamp}] ${msg.senderName || 'System'}: ${msg.content || (msg.file ? `[File: ${msg.file.originalName}]` : '')}\n`;
    });
    res.send(output);
  } catch (err) {
    console.error('[Export] Error:', err);
    res.status(500).json({ error: 'Export failed.' });
  }
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Socket.io ────────────────────────────────────────────────────────────────
chatSocket(io, app);

// ─── Start Server ─────────────────────────────────────────────────────────────
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Classroom LAN Chat running → http://localhost:${PORT}`);
  
  // Broadcast mDNS service for Capacitor clients
  try {
    const bonjour = new Bonjour.Bonjour();
    bonjour.publish({ name: 'Classroom LAN Chat', type: 'lanchat', port: PORT });
    console.log(`[mDNS] Broadcasting service '_lanchat._tcp' on port ${PORT}`);
  } catch (err) {
    console.warn(`[mDNS] Failed to start broadcasting:`, err.message);
  }
});
