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

        // Debug: Logar o que temos na memória para este mundo
        console.log(`[DEBUG] Membros no scan: ${worldMembers.size}, Jogadores com detalhes: ${worldIncomings.size}`);

        for (const [playerId, member] of worldMembers) {
            const mName = String(member.name || "").trim();
            const mId = String(playerId).trim();

            // Busca Super Leniente: tenta por ID, Nome exato, ou busca parcial no nome
            let playerAttacks = worldIncomings.get(mId);
            
            if (!playerAttacks) {
                // Tenta achar qualquer entrada que contenha o nome do jogador
                const entries = Array.from(worldIncomings.values());
                playerAttacks = entries.find(a => {
                    const storedName = String(a.playerName || "").trim().toLowerCase();
                    const targetName = mName.toLowerCase();
                    return storedName === targetName || storedName.includes(targetName) || targetName.includes(storedName);
                });
            }
            
            if (playerAttacks && playerAttacks.attacks && playerAttacks.attacks.length > 0) {
                console.log(`[MATCH SUCCESS] Vinculados ${playerAttacks.attacks.length} ataques para: ${mName}`);
            }

            const pAttacks = playerAttacks || { attacks: [], villages: [] };
            const detailedVillages = Array.isArray(pAttacks.villages) ? pAttacks.villages : [];
            const finalIncomingCount = member.incomingCount || pAttacks.incomingCount || pAttacks.attacks.length || detailedVillages.reduce((sum, v) => sum + ((v?.incomingAttacks?.length) || 0), 0) || 0;

            allAttacks.push({
                playerId: mId,
                playerName: mName,
                points: member.points || 0,
                rank: member.rank || 0,
                villageCount: member.villages || 0,
                incomingCount: finalIncomingCount,
                villages: detailedVillages,
                attacks: pAttacks.attacks || []
            });
            
            totalAttacks += finalIncomingCount;
            const flatAttacks = (pAttacks.attacks || []).length > 0
                ? (pAttacks.attacks || [])
                : detailedVillages.flatMap(v => v?.incomingAttacks || []);

            totalNobles += flatAttacks.filter(a => a.isNoble).length;
            totalRams += flatAttacks.filter(a => a.isRam).length;
        }

        // Adiciona quem tem ataques mas não apareceu no scan da tribo
        for (const [playerId, playerAttacks] of worldIncomings) {
            const pId = String(playerId).trim();
            if (!allAttacks.find(a => a.playerId === pId)) {
                allAttacks.push({
                    playerId: pId,
                    playerName: playerAttacks.playerName || "Desconhecido",
                    incomingCount: playerAttacks.incomingCount || playerAttacks.attacks.length || 0,
                    attacks: playerAttacks.attacks || []
                });
                totalAttacks += (playerAttacks.incomingCount || playerAttacks.attacks.length || 0);
                totalNobles += (playerAttacks.attacks || []).filter(a => a.isNoble).length;
                totalRams += (playerAttacks.attacks || []).filter(a => a.isRam).length;
            }
        }

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
        const { worldId, attacks, villages, playerId, playerName } = req.body;
        const attacksLen = attacks?.length || 0;
        const villagesLen = villages?.length || 0;
        console.log(`[POST] /api/tribe/incomings - worldId: ${worldId}, player: ${playerName} (${playerId}), attacks: ${attacksLen}, villages: ${villagesLen}`);
        
        if (!worldId) return res.status(400).json({ success: false, error: "worldId missing" });

        if (!tribeIncomings.has(worldId)) {
            tribeIncomings.set(worldId, new Map());
        }

        const worldIncomings = tribeIncomings.get(worldId);
        const pId = playerId || "local-player";
        const existing = worldIncomings.get(pId) || {};

        let normalizedAttacks = Array.isArray(attacks) ? attacks : (existing.attacks || []);
        let normalizedVillages = Array.isArray(villages) ? villages : (existing.villages || []);

        // Se recebemos ataques mas não aldeias detalhadas, reconstruir a estrutura de aldeias
        if (normalizedAttacks.length > 0 && normalizedVillages.length === 0) {
            console.log(`[BACKEND] Reconstruindo estrutura de aldeias para ${playerName || pId}`);
            const villageMap = new Map();
            normalizedAttacks.forEach(att => {
                const coord = att.destination?.match(/\d{1,3}\|\d{1,3}/)?.[0] || "Desconhecida";
                if (!villageMap.has(coord)) {
                    villageMap.set(coord, {
                        coord,
                        villageName: att.destination?.split("(")[0]?.trim() || "Aldeia",
                        incomingAttacks: [],
                        troops: { own: {}, support: {}, total: {} }
                    });
                }
                villageMap.get(coord).incomingAttacks.push(att);
            });
            normalizedVillages = Array.from(villageMap.values());
        }

        const incomingCount =
            req.body.incomingCount ||
            normalizedAttacks.length ||
            normalizedVillages.reduce((sum, v) => sum + ((v?.incomingAttacks?.length) || 0), 0) ||
            existing.incomingCount ||
            0;
        
        worldIncomings.set(pId, {
            playerName: playerName || existing.playerName || "Local Player",
            attacks: normalizedAttacks,
            villages: normalizedVillages,
            incomingCount,
            updatedAt: Date.now()
        });

        // Broadcast via socket
        io.emit('tribe:incomings-updated', { worldId });
        res.json({ success: true });
    });

    return router;
};
