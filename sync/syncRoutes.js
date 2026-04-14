const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');

module.exports = (worlds) => {
    // Sincronização de Mundos
    router.get('/worlds', (req, res) => {
        res.json({ success: true, data: worlds });
    });

    router.post('/worlds', (req, res) => {
        const world = { ...req.body, id: uuidv4() };
        worlds.push(world);
        res.json({ success: true, data: world });
    });

    // Patch para atualizar info do mundo/jogador
    router.patch('/worlds/:worldId', (req, res) => {
        const { worldId } = req.params;
        const index = worlds.findIndex(w => w.worldId === worldId || w.id === worldId);
        
        if (index !== -1) {
            worlds[index] = { ...worlds[index], ...req.body, updatedAt: Date.now() };
            res.json({ success: true, data: worlds[index] });
        } else {
            // Se não existir, cria um novo
            const newWorld = { ...req.body, worldId, id: uuidv4(), updatedAt: Date.now() };
            worlds.push(newWorld);
            res.json({ success: true, data: newWorld });
        }
    });

    return router;
};
