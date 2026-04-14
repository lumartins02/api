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
let tribeIncomings = new Map(); // key: worldId, value: Map of playerId -> attacks

// ─── API ROUTES ──────────────────────────────────────────────────────────

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

// Tribe Defense
app.get('/api/tribe/incomings', (req, res) => {
    const { worldId } = req.query;
    console.log(`[GET] /api/tribe/incomings - worldId: ${worldId}`);
    const worldIncomings = tribeIncomings.get(worldId) || new Map();
    const allAttacks = [];
    let totalAttacks = 0;
    let totalNobles = 0;
    let totalRams = 0;

    for (const [playerId, playerAttacks] of worldIncomings) {
        allAttacks.push({
            playerId,
            playerName: playerAttacks.playerName || "Desconhecido",
            attacks: playerAttacks.attacks || []
        });
        totalAttacks += (playerAttacks.attacks || []).length;
        totalNobles += (playerAttacks.attacks || []).filter(a => a.isNoble).length;
        totalRams += (playerAttacks.attacks || []).filter(a => a.isRam).length;
    }

    console.log(`[GET] /api/tribe/incomings - Retornando ${allAttacks.length} jogadores, ${totalAttacks} ataques totais`);
    res.json({
        success: true,
        data: {
            members: allAttacks,
            totalAttacks,
            totalNobles,
            totalRams
        }
    });
});

app.post('/api/tribe/incomings', (req, res) => {
    const { worldId, attacks, playerId, playerName } = req.body;
    console.log(`[POST] /api/tribe/incomings - worldId: ${worldId}, player: ${playerName} (${playerId}), attacks: ${attacks?.length || 0}`);
    
    if (!worldId) return res.status(400).json({ success: false, error: "worldId missing" });

    if (!tribeIncomings.has(worldId)) {
        tribeIncomings.set(worldId, new Map());
    }

    const worldIncomings = tribeIncomings.get(worldId);
    const pId = playerId || "local-player";
    worldIncomings.set(pId, {
        playerName: playerName || "Local Player",
        attacks: attacks || [],
        updatedAt: Date.now()
    });

    // Broadcast para outros membros via socket
    io.emit('tribe:incomings-updated', { worldId });
    console.log(`[SOCKET] Emitindo tribe:incomings-updated para worldId: ${worldId}`);

    res.json({ success: true });
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
