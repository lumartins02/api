const express = require('express');
const router = express.Router();

module.exports = () => {
    // Mock de autenticação para o endpoint /auth/me
    router.get('/me', (req, res) => {
        res.json({
            success: true,
            data: {
                id: "user-123",
                email: "admin@acidpro.local",
                displayName: "AcidPro Admin",
                subscriptionTier: "pro",
                maxWorlds: 999,
                captchaApiEnabled: true,
                isActive: true,
                licenseStatus: "lifetime",
                createdAt: new Date().toISOString()
            }
        });
    });

    // Mock para validação de acesso
    router.get('/validate-access', (req, res) => {
        res.json({
            success: true,
            data: {
                allowed: true,
                reason: "",
                isActive: true,
                maxWorlds: 999,
                subscriptionTier: "pro",
                captchaApiEnabled: true,
                premiumScripts: []
            }
        });
    });

    return router;
};
