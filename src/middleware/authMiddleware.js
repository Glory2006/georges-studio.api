const jwt = require('jsonwebtoken');
const supabase = require('../config/supabase');

// ══════════════════════════════════════════════════════════════
// AUTH MIDDLEWARE
// Vérifie que le token JWT est présent et valide.
// À placer devant toutes les routes /admin/* (sauf login).
//
// Usage dans les routes :
//   router.get('/admin/reservations', authMiddleware, getAllReservations);
//
// Le client doit envoyer le token dans le header :
//   Authorization: Bearer <token>
// ══════════════════════════════════════════════════════════════

async function authMiddleware(req, res, next) {
    const authHeader = req.headers['authorization'];

    // Le header doit être de la forme "Bearer <token>"
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Token manquant ou malformé.' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.adminId = decoded.adminId; // disponible dans les controllers suivants

        // Charge le rôle à chaque requête afin qu'une modification dans
        // Supabase soit prise en compte sans devoir recréer le token.
        const primary = await supabase
            .from('admins')
            .select('*')
            .eq('id', decoded.adminId)
            .maybeSingle();
        const admin = primary.data || (await supabase
            .from('admin')
            .select('*')
            .eq('id', decoded.adminId)
            .maybeSingle()).data;

        if (!admin) return res.status(401).json({ message: 'Compte administrateur introuvable.' });
        req.admin = { ...admin, role: admin.role || 'photographe' };
        next();
    } catch (err) {
        return res.status(401).json({ message: 'Token invalide ou expiré.' });
    }
}

function requireRole(...allowedRoles) {
    return (req, res, next) => {
        if (!req.admin || !allowedRoles.includes(req.admin.role)) {
            return res.status(403).json({ message: 'Droits insuffisants pour cette action.' });
        }
        next();
    };
}

module.exports = authMiddleware;
module.exports.requireRole = requireRole;
