const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

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
const tribeRoutes = require('./tribe/tribeRoutes')(io, tribeIncomings, tribeMembers);
app.use('/api/tribe', tribeRoutes);

// Root Status
app.get('/', (req, res) => {
    res.json({
        status: "online",
        service: "AcidPro Private API",
        version: "1.0.0",
        endpoints: ["/api/auth/me", "/api/sync/worlds", "/api/tribe/incomings", "/api/tribe/members"]
    });
});

// Auth
app.get('/api/auth/me', (req, res) => {
    res.json({
        success: true,
        data: {
            id: "user-123",
            email: "admin@acidpro.local",
            displayName: "AcidPro Admin",
            subscriptionTier: "pro",
            isActive: true,
            licenseStatus: "lifetime"
        }
    });
});

// Sincronização de Mundos
app.get('/api/sync/worlds', (req, res) => {
    res.json({ success: true, data: worlds });
});

app.post('/api/sync/worlds', (req, res) => {
    const world = { ...req.body, id: uuidv4() };
    worlds.push(world);
    res.json({ success: true, data: world });
});

// Motor Lock
app.post('/api/motor/lock', (req, res) => {
    const { worldId, deviceId, deviceName } = req.body;
    const currentLock = locks.get(worldId);

    if (currentLock && currentLock.deviceId !== deviceId) {
        return res.status(409).json({
            success: false,
            lockedBy: currentLock.deviceName || "Outro dispositivo"
        });
    }

    locks.set(worldId, { deviceId, deviceName, timestamp: Date.now() });
    res.json({ success: true });
});

// Logs (Opcional, para evitar erros no bot)
app.post('/api/logs', (req, res) => {
    // console.log(`[LOGS] Recebidos ${req.body?.logs?.length || 0} logs`);
    res.json({ success: true });
});

// Configs Sync

app.post('/api/motor/heartbeat', (req, res) => {
    const { worldId, deviceId } = req.body;
    const lock = locks.get(worldId);
    if (lock && lock.deviceId === deviceId) {
        lock.timestamp = Date.now();
        return res.json({ success: true, data: { allowed: true, isActive: true, subscriptionTier: "pro" } });
    }
    res.status(403).json({ success: false, error: "lock_lost" });
});

// Tribe Defense (Exemplo de Rota de Compartilhamento)
app.post('/api/defense/share', (req, res) => {
    const data = req.body;
    // Retransmite para todos os membros da tribo via Socket
    io.to(`tribe_${data.tribeId}`).emit('defense:update', data);
    res.json({ success: true });
});

// ─── WEBSOCKETS ──────────────────────────────────────────────────────────

io.on('connection', (socket) => {
    console.log('Dispositivo conectado:', socket.id);

    socket.on('join-tribe', (tribeId) => {
        socket.join(`tribe_${tribeId}`);
        console.log(`Socket ${socket.id} entrou na tribo ${tribeId}`);
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
