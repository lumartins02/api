const express = require('express');
const router = express.Router();

module.exports = (io, tribeIncomings, tribeMembers) => {
    // Tribe Members Summary (Scan Results)
    router.get('/members', (req, res) => {
        const { worldId } = req.query;
        const worldMembers = tribeMembers.get(worldId) || new Map();
        // Convert Map values to Array
        const data = Array.from(worldMembers.values());
        res.json({ success: true, data });
    });

    router.post('/members', (req, res) => {
        const { worldId, members, allyName } = req.body;
        if (!worldId) return res.status(400).json({ success: false, error: "worldId missing" });
        
        if (!tribeMembers.has(worldId)) {
            tribeMembers.set(worldId, new Map());
        }
        
        const worldMembers = tribeMembers.get(worldId);
        (members || []).forEach(m => {
            // Garantindo que o ID seja String para bater com o que o bot envia
            worldMembers.set(String(m.playerId), { 
                ...m, 
                playerId: String(m.playerId), 
                allyName, 
                updatedAt: Date.now() 
            });
        });
        
        res.json({ success: true });
    });

    // Tribe Defense (Detailed Attacks)
    router.get('/incomings', (req, res) => {
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
            // Busca inteligente: tenta por ID, se não encontrar tenta por nome exato (caso o ID mude no scan)
            let playerAttacks = worldIncomings.get(playerId);
            if (!playerAttacks) {
                playerAttacks = Array.from(worldIncomings.values()).find(a => a.playerName === member.name);
            }
            
            // Se ainda não encontrou nada, cria objeto vazio com ataques vazios
            playerAttacks = playerAttacks || { attacks: [] };
            
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

        // Se houver algum jogador com ataques mas que não está na lista de membros
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

    router.post('/incomings', (req, res) => {
        const { worldId, attacks, playerId, playerName } = req.body;
        console.log(`[POST] /api/tribe/incomings - worldId: ${worldId}, player: ${playerName} (${playerId}), attacks: ${attacks?.length || 0}`);
        
        if (!worldId) return res.status(400).json({ success: false, error: "worldId missing" });

        if (!tribeIncomings.has(worldId)) {
            tribeIncomings.set(worldId, new Map());
        }

        const worldIncomings = tribeIncomings.get(worldId);
        const pId = playerId || "local-player";
        const existing = worldIncomings.get(pId) || {};
        
        worldIncomings.set(pId, {
            playerName: playerName || existing.playerName || "Local Player",
            attacks: attacks || existing.attacks || [],
            incomingCount: req.body.incomingCount || attacks?.length || existing.incomingCount || 0,
            updatedAt: Date.now()
        });

        // Broadcast via socket
        io.emit('tribe:incomings-updated', { worldId });
        res.json({ success: true });
    });

    return router;
};
