const supabase = require('../config/supabase');

// ── [PUBLIC] Ping keep-alive ─────────────────────────────────────
// Équivalent Express de `app/api/ping/route.ts` (Next.js).
// BUT : faire une requête DB ultra-légère pour empêcher
// Supabase Free de se mettre en pause après 7 jours d'inactivité.
// À appeler via un cron externe (cron-job.org, UptimeRobot...)
// toutes les 24-48h : GET https://ton-backend.com/api/ping
async function ping(req, res) {
    const startedAt = Date.now();
    try {
        const { error } = await supabase
            .from('type_photos')
            .select('id', { count: 'exact', head: false })
            .limit(1);

        if (error) throw error;

        return res.status(200).json({
            ok: true,
            message: 'pong',
            supabase: 'up',
            latency_ms: Date.now() - startedAt,
            timestamp: new Date().toISOString(),
        });
    } catch (err) {
        console.error('[ping] Supabase injoignable :', err.message);
        return res.status(503).json({
            ok: false,
            message: 'pong mais supabase down',
            supabase: 'down',
            error: err.message,
            timestamp: new Date().toISOString(),
        });
    }
}

module.exports = { ping };
