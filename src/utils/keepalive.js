const supabase = require('../config/supabase');

// ── Auto-ping Supabase (anti-suspension Free plan) ──────────────
// Supabase Free met le projet en pause après 7 jours SANS requête.
// Ce module envoie une requête DB légère en interne, sans dépendre
// d'un cron externe ni du déploiement du site vitrine.
//
// Lancement : require('./src/utils/keepalive').startKeepAlive()
// (appelé dans server.js au démarrage)

const DEFAULT_INTERVAL_MS = 12 * 60 * 60 * 1000; // 12h

async function pingSupabase() {
    const startedAt = Date.now();
    try {
        const { error } = await supabase
            .from('type_photos')
            .select('id')
            .limit(1);

        if (error) throw error;

        console.log(`[keepalive] ✅ Supabase actif (${Date.now() - startedAt}ms)`);
        return true;
    } catch (err) {
        console.error(`[keepalive] ❌ Supabase injoignable : ${err.message}`);
        return false;
    }
}

function startKeepAlive() {
    const intervalMs = Number(process.env.KEEPALIVE_INTERVAL_MS) || DEFAULT_INTERVAL_MS;

    // Première requête immédiate au démarrage
    pingSupabase();

    const timer = setInterval(pingSupabase, intervalMs);
    timer.unref(); // n'empêche pas le process Node de s'arrêter

    const minutes = Math.round(intervalMs / 60000);
    console.log(`[keepalive] 🔁 Auto-ping Supabase toutes les ${minutes} min`);

    return timer;
}

module.exports = { startKeepAlive, pingSupabase };
