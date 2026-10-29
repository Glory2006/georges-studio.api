const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();

const routes = require('./src/routes/index');
const { startKeepAlive } = require('./src/utils/keepalive');
const supabase = require('./src/config/supabase');
const studioConfig = require('./src/config/studio');

const app = express();
const JSON_BODY_LIMIT = process.env.JSON_BODY_LIMIT || '25mb';   // upload photos admin
const PUBLIC_JSON_LIMIT = '100kb';                                // routes publiques

// ── Trust proxy ─────────────────────────────────────────────
// Derrière Render/Heroku/nginx, sinon rate-limit voit l'IP du proxy
// et limite tout le monde ensemble.
const trustProxy = process.env.TRUST_PROXY ?? (process.env.NODE_ENV === 'production' ? '1' : '');
if (trustProxy !== '') {
    app.set('trust proxy', Number(trustProxy) || 1);
}

// ── Middlewares globaux ─────────────────────────────────────
// helmet : HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy...
// crossOriginResourcePolicy 'cross-origin' : le défaut 'same-origin'
// bloquerait les appels du frontend vers l'API.
app.use(helmet({
    contentSecurityPolicy: false,        // l'API ne sert que du JSON, pas de HTML
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// CORS restreint via CORS_ORIGIN (CSV). Sans configuration : comportement
// actuel conservé + avertissement explicite.
const corsOrigins = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);

if (corsOrigins.length > 0) {
    app.use(cors({ origin: corsOrigins }));
} else {
    console.warn('⚠️  CORS_ORIGIN non défini : toutes les origines sont acceptées. Définissez CORS_ORIGIN en production.');
    app.use(cors());
}

// ── Body parsers ────────────────────────────────────────────
// 100ko par défaut : sans ça, un attaquant peut envoyer 25 Mo sur
// /reservations et saturer la mémoire. Le gros limite est réservé
// à l'upload photo admin.
const publicJsonParser = express.json({ limit: PUBLIC_JSON_LIMIT });
const uploadJsonParser = express.json({ limit: JSON_BODY_LIMIT });

app.use((req, res, next) => {
    const isPhotoUpload = req.method !== 'GET' && req.path.startsWith('/api/admin/photos');
    (isPhotoUpload ? uploadJsonParser : publicJsonParser)(req, res, next);
});

app.use(express.urlencoded({ extended: true, limit: PUBLIC_JSON_LIMIT }));

// ── Routes ─────────────────────────────────────────────────
app.use('/api', routes);

app.use((err, req, res, next) => {
    if (err?.type === 'entity.too.large') {
        return res.status(413).json({
            message: `Requête trop volumineuse. Taille maximale : ${JSON_BODY_LIMIT} (upload photo) ou ${PUBLIC_JSON_LIMIT} (autres routes).`
        });
    }

    console.error(err);
    return res.status(500).json({ message: 'Erreur serveur.' });
});

// ── Démarrage ───────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
async function startServer() {
  const { data, error } = await supabase
    .from('studio_settings')
    .select('opening_time, closing_time, default_slot_duration')
    .eq('id', 1)
    .maybeSingle();

  if (!error && data) {
    studioConfig.applyStudioConfig({
      opening_time: String(data.opening_time).slice(0, 5),
      closing_time: String(data.closing_time).slice(0, 5),
      default_slot_duration: Number(data.default_slot_duration),
    });
  } else if (error) {
    console.warn('⚠️ Configuration Supabase des horaires indisponible : horaires par défaut utilisés.');
  }

  app.listen(PORT, () => {
    console.log(`Serveur démarré sur le port http://localhost:${PORT}`);
    if (corsOrigins.length > 0) {
        console.log(`🔒 CORS restreint à : ${corsOrigins.join(', ')}`);
    }

    // Auto-ping Supabase pour éviter la pause (7 jours sans requête)
    startKeepAlive();
  });
}

startServer();
