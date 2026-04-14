const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

// Mock Database (Em produção, use MongoDB ou PostgreSQL)
let worlds = [];
let locks = new Map();
let configs = new Map();
const tribeIncomings = new Map(); // key: worldId, value: Map of playerId -> attacks
const tribeMembers = new Map();   // key: worldId, value: Map of playerId -> member info

// ─── ROUTES ──────────────────────────────────────────────────────────────

// Auth
const authRoutes = require('./auth/authRoutes')();
app.use('/api/auth', authRoutes);

// Sync
const syncRoutes = require('./sync/syncRoutes')(worlds);
app.use('/api/sync', syncRoutes);

// Tribe
const tribeRoutes = require('./tribe/tribeRoutes')(io, tribeIncomings, tribeMembers);
app.use('/api/tribe', tribeRoutes);

// Motor
const motorRoutes = require('./motor/motorRoutes')(locks);
app.use('/api/motor', motorRoutes);

// Utils (Logs, etc)
const utilRoutes = require('./utils/utilRoutes')();
app.use('/api', utilRoutes); // Mantém /api/logs

// Root Status
app.get('/', (req, res) => {
    res.json({
        status: "online",
        service: "AcidPro Private API",
        version: "1.1.0",
        endpoints: [
            "/api/auth/me", 
            "/api/sync/worlds", 
            "/api/tribe/incomings", 
            "/api/tribe/members",
            "/api/motor/lock",
            "/api/logs"
        ]
    });
});

// ─── WEBSOCKETS ──────────────────────────────────────────────────────────

io.on('connection', (socket) => {
    console.log('Dispositivo conectado:', socket.id);

    socket.on('join-world', (worldId) => {
        socket.join(`world_${worldId}`);
        console.log(`Socket ${socket.id} entrou no mundo ${worldId}`);
    });

    socket.on('motor:started', (data) => {
        socket.broadcast.emit('motor:remote-started', data);
    });

    socket.on('disconnect', () => {
        console.log('Dispositivo desconectado');
    });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, "0.0.0.0", () => {
    console.log(`API AcidPro rodando na porta ${PORT}`);
});
