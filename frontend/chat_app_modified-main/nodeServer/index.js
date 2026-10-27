const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// Enable CORS for Express routes
app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (mobile apps, curl, etc.)
        if (!origin) return callback(null, true);

        const allowedOrigins = process.env.CORS_ORIGIN
            ? process.env.CORS_ORIGIN.split(',')
            : [
                "http://127.0.0.1:5500",
                "http://localhost:5500",
                "https://atrijade.github.io"
            ];

        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            console.log('CORS blocked origin:', origin);
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ["GET", "POST"],
    credentials: true
}));

// CORS configuration for Socket.io
const allowedOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',')
    : [
        "http://127.0.0.1:5500",
        "http://localhost:5500",
        "https://atrijade.github.io" // Your actual GitHub Pages URL
    ];

const io = new Server(server, {
    cors: {
        origin: allowedOrigins,
        methods: ["GET", "POST"],
        credentials: true
    }
});

// Add express middleware
app.use(express.json());

// Health check endpoint
app.get('/', (req, res) => {
    res.json({
        message: 'ModernChat Server is running!',
        timestamp: new Date().toISOString(),
        onlineUsers: getOnlineCount()
    });
});

// CORS preflight for all routes
app.options('*', (req, res) => {
    res.header('Access-Control-Allow-Origin', req.headers.origin);
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.sendStatus(200);
});

const users = {};

// Helper function to get online user count
function getOnlineCount() {
    return Object.keys(users).length;
}

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    socket.on('new-user-joined', (name) => {
        console.log("New user joined:", name);
        users[socket.id] = name;

        // Notify others about new user
        socket.broadcast.emit('user-joined', name);

        // Send current online count to all users
        io.emit('online-count', getOnlineCount());
    }); socket.on('send', (message) => {
        console.log(`Message from ${users[socket.id]}: ${message}`);
        socket.broadcast.emit('receive', {
            message: message,
            name: users[socket.id],
            timestamp: new Date().toISOString()
        });
    });

    socket.on('typing', (data) => {
        // Broadcast typing indicator to all other users
        socket.broadcast.emit('typing', data);
    });

    socket.on('send-file', (fileData) => {
        console.log(`File from ${users[socket.id]}: ${fileData.name} (${fileData.size} bytes)`);

        // Broadcast file to all other users
        socket.broadcast.emit('receive-file', {
            name: fileData.name,
            type: fileData.type,
            size: fileData.size,
            data: fileData.data,
            sender: users[socket.id],
            timestamp: new Date().toISOString()
        });
    });

    socket.on('disconnect', (reason) => {
        console.log(`User disconnected: ${socket.id}, reason: ${reason}`);

        if (users[socket.id]) {
            const userName = users[socket.id];

            // Notify others about user leaving
            socket.broadcast.emit('dis', {
                message: 'left the chat',
                name: userName
            });

            delete users[socket.id];

            // Send updated online count to all users
            io.emit('online-count', getOnlineCount());
        }
    });

    // Handle connection errors
    socket.on('error', (error) => {
        console.error('Socket error:', error);
    });
});

// Server error handling
server.on('error', (error) => {
    console.error('Server error:', error);
});

server.listen(process.env.PORT || 8080, () => {
    const port = process.env.PORT || 8080;
    console.log(`🚀 ModernChat server listening on port ${port}`);
    console.log('📱 Access your chat at: http://localhost:5500');
    if (process.env.NODE_ENV === 'production') {
        console.log('🌍 Running in production mode');
    }
});