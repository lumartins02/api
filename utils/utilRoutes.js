const express = require('express');
const router = express.Router();

module.exports = () => {
    // Receber Logs do Bot
    router.post('/logs', (req, res) => {
        const { worldId, logs } = req.body;
        // console.log(`[LOGS] ${worldId}: Recebidos ${logs?.length || 0} registros`);
        res.json({ success: true });
    });

    return router;
};
