const express = require('express');
const router = express.Router();

module.exports = (io, tribeIncomings, tribeMembers) => {
    // Helper para normalizar IDs de jogador para strings inteiras (evitar "919041668.0")
    const normalizeId = (id) => {
        if (id === null || id === undefined) return "local-player";
        const s = String(id).trim();
        if (s.endsWith('.0')) return s.slice(0, -2);
        return s;
    };

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
            const pId = normalizeId(m.playerId);
            worldMembers.set(pId, { 
                ...m, 
                playerId: pId, 
                allyName, 
                updatedAt: Date.now() 
            });
        });
        
        res.json({ success: true });
    });

    // Tribe Defense (Detailed Attacks)
    router.get('/incomings', (req, res) => {
        const { worldId } = req.query;
        console.log(`\n\x1b[36m[TRIBE DEBUG] GET /incomings - Mundo: ${worldId}\x1b[0m`);
        
        const worldIncomings = tribeIncomings.get(worldId) || new Map();
        const worldMembers = tribeMembers.get(worldId) || new Map();
        
        console.log(`\x1b[33m[TRIBE DEBUG] Memória do Mundo ${worldId}:\x1b[0m`);
        console.log(`  - Membros no Scan da Tribo: ${worldMembers.size}`);
        console.log(`  - Jogadores com Detalhes (Incomings): ${worldIncomings.size}`);

        const allAttacks = [];
        let totalAttacks = 0;
        let totalNobles = 0;
        let totalRams = 0;

        const normalizeStr = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

        for (const [playerId, member] of worldMembers) {
            const mName = String(member.name || "").trim();
            const mId = normalizeId(playerId);

            console.log(`\x1b[34m[TRIBE DEBUG] Processando Membro: ${mName} (ID: ${mId})\x1b[0m`);

            let playerAttacks = worldIncomings.get(mId);
            let matchType = "Nenhum";
            
            if (!playerAttacks) {
                const entries = Array.from(worldIncomings.values());
                playerAttacks = entries.find(a => normalizeStr(a.playerName) === normalizeStr(mName));
                if (playerAttacks) matchType = "Nome Exato";
            } else {
                matchType = "ID Exato";
            }
            
            if (!playerAttacks && normalizeStr(mName) === "suki") {
                const entries = Array.from(worldIncomings.values());
                playerAttacks = entries.find(a => normalizeStr(a.playerName).includes("suki") || a.playerId === "local-player");
                if (playerAttacks) matchType = "Forçado (Sukí)";
            }

            if (playerAttacks) {
                console.log(`  \x1b[32m[MATCH SUCCESS] Tipo: ${matchType} | Attacks: ${playerAttacks.attacks?.length || 0} | Villages: ${playerAttacks.villages?.length || 0}\x1b[0m`);
            } else {
                console.log(`  \x1b[31m[MATCH FAIL] Nenhum detalhe encontrado para ${mName}\x1b[0m`);
            }

            const pAttacks = playerAttacks || { attacks: [], villages: [] };
            let detailedVillages = Array.isArray(pAttacks.villages) ? pAttacks.villages : [];

            if (detailedVillages.length === 0 && pAttacks.attacks && pAttacks.attacks.length > 0) {
                console.log(`  \x1b[35m[DEBUG] Reconstruindo aldeias para ${mName} em tempo real...\x1b[0m`);
                const vMap = new Map();
                pAttacks.attacks.forEach(att => {
                    const coord = att.destination?.match(/\d{1,3}\|\d{1,3}/)?.[0] || "Desconhecida";
                    if (!vMap.has(coord)) {
                        vMap.set(coord, {
                            coord,
                            villageName: att.destination?.split("(")[0]?.trim() || "Aldeia",
                            incomingAttacks: [],
                            troops: { own: {}, support: {}, total: {} }
                        });
                    }
                    vMap.get(coord).incomingAttacks.push(att);
                });
                detailedVillages = Array.from(vMap.values());
            }

            const finalIncomingCount = member.incomingCount || pAttacks.incomingCount || pAttacks.attacks.length || 0;

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
            const flatAttacks = pAttacks.attacks || detailedVillages.flatMap(v => v.incomingAttacks || []);
            totalNobles += flatAttacks.filter(a => a.isNoble).length;
            totalRams += flatAttacks.filter(a => a.isRam).length;
        }

        console.log(`\x1b[36m[TRIBE DEBUG] Resumo Final: ${allAttacks.length} jogadores, ${totalAttacks} ataques totais.\x1b[0m\n`);

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
        const pId = normalizeId(playerId);
        const attacksLen = attacks?.length || 0;
        const villagesLen = villages?.length || 0;
        
        console.log(`\n\x1b[32m[TRIBE DEBUG] POST /incomings - Recebendo dados de: ${playerName} (${pId})\x1b[0m`);
        console.log(`  - Mundo: ${worldId}`);
        console.log(`  - Ataques: ${attacksLen}`);
        console.log(`  - Aldeias Detalhadas: ${villagesLen}`);

        if (!worldId) return res.status(400).json({ success: false, error: "worldId missing" });

        if (!tribeIncomings.has(worldId)) {
            tribeIncomings.set(worldId, new Map());
        }

        const worldIncomings = tribeIncomings.get(worldId);
        const existing = worldIncomings.get(pId) || {};

        let normalizedAttacks = Array.isArray(attacks) ? attacks : (existing.attacks || []);
        let normalizedVillages = Array.isArray(villages) ? villages : (existing.villages || []);

        if (normalizedAttacks.length > 0 && normalizedVillages.length === 0) {
            console.log(`  \x1b[35m[DEBUG] Reconstruindo aldeias para ${playerName || pId} no recebimento...\x1b[0m`);
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

        if (normalizedVillages.length === 0 && existing.villages && existing.villages.length > 0 && normalizedAttacks.length > 0) {
            normalizedVillages = existing.villages;
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

        console.log(`\x1b[35m[SOCKET DEBUG] Emitindo tribe:incomings-updated para o mundo: ${worldId}\x1b[0m`);
        io.emit('tribe:incomings-updated', { worldId });
        res.json({ success: true });
    });

    return router;
};
