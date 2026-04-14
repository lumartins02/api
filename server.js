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
let tribeMembers = new Map();   // key: worldId, value: Map of playerId -> member info

// ─── API ROUTES ──────────────────────────────────────────────────────────

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

// Tribe Members Summary (Scan Results)
app.get('/api/tribe/members', (req, res) => {
    const { worldId } = req.query;
    const worldMembers = tribeMembers.get(worldId) || new Map();
    // Convert Map values to Array
    const data = Array.from(worldMembers.values());
    res.json({ success: true, data });
});

app.post('/api/tribe/members', (req, res) => {
    const { worldId, members, allyName } = req.body;
    if (!worldId) return res.status(400).json({ success: false, error: "worldId missing" });
    
    if (!tribeMembers.has(worldId)) {
        tribeMembers.set(worldId, new Map());
    }
    
    const worldMembers = tribeMembers.get(worldId);
    (members || []).forEach(m => {
        worldMembers.set(m.playerId, { ...m, allyName, updatedAt: Date.now() });
    });
    
    res.json({ success: true });
});

// Tribe Defense (Detailed Attacks)
app.get('/api/tribe/incomings', (req, res) => {
    const { worldId } = req.query;
    console.log(`[GET] /api/tribe/incomings - worldId: ${worldId}`);
    
    const worldIncomings = tribeIncomings.get(worldId) || new Map();
    const worldMembers = tribeMembers.get(worldId) || new Map();
    
    const allAttacks = [];
    let totalAttacks = 0;
    let totalNobles = 0;
    let totalRams = 0;

    // Primeiro, pegamos todos os membros detectados no scan da tribo
    for (const [playerId, member] of worldMembers) {
        const playerAttacks = worldIncomings.get(playerId) || { attacks: [] };
        
        allAttacks.push({
            playerId,
            playerName: member.name || playerAttacks.playerName || "Desconhecido",
            points: member.points || 0,
            rank: member.rank || 0,
            villages: member.villages || 0,
            incomingCount: member.incomingCount || playerAttacks.incomingCount || playerAttacks.attacks.length || 0,
            attacks: playerAttacks.attacks || []
        });
        
        totalAttacks += (member.incomingCount || playerAttacks.incomingCount || playerAttacks.attacks.length || 0);
        totalNobles += (playerAttacks.attacks || []).filter(a => a.isNoble).length;
        totalRams += (playerAttacks.attacks || []).filter(a => a.isRam).length;
    }

    // Se houver algum jogador com ataques mas que não está na lista de membros (ex: o próprio usuário antes do scan)
    for (const [playerId, playerAttacks] of worldIncomings) {
        if (!worldMembers.has(playerId)) {
            allAttacks.push({
                playerId,
                playerName: playerAttacks.playerName || "Desconhecido",
                incomingCount: playerAttacks.incomingCount || playerAttacks.attacks.length || 0,
                attacks: playerAttacks.attacks || []
            });
            totalAttacks += (playerAttacks.incomingCount || playerAttacks.attacks.length || 0);
            totalNobles += (playerAttacks.attacks || []).filter(a => a.isNoble).length;
            totalRams += (playerAttacks.attacks || []).filter(a => a.isRam).length;
        }
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
    
    // Se recebemos ataques detalhados, mantemos. Se não, mantemos o que já existe ou apenas o contador.
    const existing = worldIncomings.get(pId) || {};
    
    worldIncomings.set(pId, {
        playerName: playerName || existing.playerName || "Local Player",
        attacks: attacks || existing.attacks || [],
        incomingCount: req.body.incomingCount || attacks?.length || existing.incomingCount || 0,
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
