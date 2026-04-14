const express = require('express');
const router = express.Router();

module.exports = (locks) => {
    // Adquirir Lock do Motor
    router.post('/lock', (req, res) => {
        const { worldId, deviceId, deviceName } = req.body;
        const currentLock = locks.get(worldId);

        if (currentLock && currentLock.deviceId !== deviceId) {
            // Se o lock expirou (ex: 10 min sem heartbeat), permite novo lock
            if (Date.now() - currentLock.timestamp > 600000) {
                locks.delete(worldId);
            } else {
                return res.status(409).json({
                    success: false,
                    lockedBy: currentLock.deviceName || "Outro dispositivo"
                });
            }
        }

        locks.set(worldId, { deviceId, deviceName, timestamp: Date.now() });
        res.json({ success: true });
    });

    // Heartbeat do Motor (manter lock ativo)
    router.post('/heartbeat', (req, res) => {
        const { worldId, deviceId } = req.body;
        const lock = locks.get(worldId);
        
        if (lock && lock.deviceId === deviceId) {
            lock.timestamp = Date.now();
            return res.json({ 
                success: true, 
                data: { 
                    allowed: true, 
                    isActive: true, 
                    subscriptionTier: "pro" 
                } 
            });
        }
        res.status(403).json({ success: false, error: "lock_lost" });
    });

    // Liberar Lock (ao fechar o mundo)
    router.post('/release', (req, res) => {
        const { worldId, deviceId } = req.body;
        const lock = locks.get(worldId);
        
        if (lock && lock.deviceId === deviceId) {
            locks.delete(worldId);
            return res.json({ success: true });
        }
        res.json({ success: true }); // Mesmo se não achar o lock
    });

    return router;
};
