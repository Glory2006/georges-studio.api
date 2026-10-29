const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();

// ── Controllers ────────────────────────────────────────────────
const { loginAdmin, createAdmin, getProfile,
        updateProfile, updatePassword }             = require('../controllers/adminController');
const { createReservation, getAllReservations,
        getReservationById, updateReservation, updateStatutReservation,
        deleteReservation }                          = require('../controllers/reservationController');
const { getDisponibilites, getAllDisponibilites,
        createDisponibilite, updateDisponibilite,
        deleteDisponibilite, createClientSlot }      = require('../controllers/disponibiliteController');
const { getTypePhotos, getTypePhotoBySlug,
        getAllTypePhotos, createTypePhoto,
        updateTypePhoto, deleteTypePhoto }           = require('../controllers/typePhotoController');
const { getPhotos, getPhotosBySlug, getAllPhotos,
        createPhoto, updatePhoto, reorderPhotos,
        deletePhoto }                                = require('../controllers/photoController');
const { ping } = require('../controllers/pingController');

// ── Middleware d'authentification ──────────────────────────────
const authMiddleware = require('../middleware/authMiddleware');
const { requireRole } = authMiddleware;
const studioConfig = require('../config/studio');
const supabase = require('../config/supabase');
const { logActivity } = require('../utils/activityLogger');


// ══════════════════════════════════════════════════════════════
//  RATE LIMITING (anti brute-force / anti-spam)
// ══════════════════════════════════════════════════════════════

// Login admin : 5 essais / 15 min par IP (brute-force)
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Trop de tentatives de connexion. Réessayez dans 15 minutes.' },
});

// Réservations publiques : 10 / heure (anti-spam / stockage abusif)
const bookingLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Trop de demandes de réservation. Réessayez plus tard.' },
});

// Ping keep-alive : 60 / minute
const pingLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Trop de requêtes.' },
});


// ══════════════════════════════════════════════════════════════
//  CONFIG DU STUDIO
// ══════════════════════════════════════════════════════════════

router.get('/config/studio', (req, res) => {
  const config = studioConfig.getStudioConfig();
  
  res.json({
    opening_time: config.opening_time,
    closing_time: config.closing_time,
    default_slot_duration: config.default_slot_duration,
    slot_interval: config.slot_interval,
    cancellation_deadline: config.cancellation_deadline,
  });
});

router.get('/admin/studio-config', authMiddleware, (req, res) => {
  res.json({ config: studioConfig.getStudioConfig() });
});

router.put('/admin/studio-config', authMiddleware, requireRole('photographe'), async (req, res) => {
  try {
    const { opening_time, closing_time, default_slot_duration } = req.body;
    const previous = { ...studioConfig.getStudioConfig() };
    const updated = studioConfig.updateStudioConfig({
      opening_time,
      closing_time,
      default_slot_duration: Number(default_slot_duration),
    });

    const { data, error } = await supabase
      .from('studio_settings')
      .upsert({
        id: 1,
        opening_time: updated.opening_time,
        closing_time: updated.closing_time,
        default_slot_duration: updated.default_slot_duration,
        updated_by: req.adminId,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' })
      .select('opening_time, closing_time, default_slot_duration')
      .single();

    if (error) {
      console.error(error);
      return res.status(500).json({ message: 'Les horaires n’ont pas pu être enregistrés dans Supabase.' });
    }

    await logActivity({
      actorType: 'admin',
      actorId: req.adminId,
      action: 'modification',
      entityType: 'configuration',
      entityId: null,
      description: 'Horaires du studio modifiés',
      metadata: {
        avant: {
          opening_time: previous.opening_time,
          closing_time: previous.closing_time,
          default_slot_duration: previous.default_slot_duration,
        },
        apres: {
          opening_time: updated.opening_time,
          closing_time: updated.closing_time,
          default_slot_duration: updated.default_slot_duration,
        },
      },
    });

    return res.json({ message: 'Horaires du studio enregistrés.', config: {
      opening_time: String(data.opening_time).slice(0, 5),
      closing_time: String(data.closing_time).slice(0, 5),
      default_slot_duration: Number(data.default_slot_duration),
    }});
  } catch (err) {
    return res.status(400).json({ message: err.message || 'Horaires invalides.' });
  }
});


// ══════════════════════════════════════════════════════════════
//  PING KEEP-ALIVE (anti-pause Supabase Free)
// ══════════════════════════════════════════════════════════════
// GET /api/ping — public, sans auth. Équivalent de app/api/ping/route.ts en Next.js.
router.get('/ping', pingLimiter, ping);


// ══════════════════════════════════════════════════════════════
//  AUTH / COMPTE ADMIN
// ══════════════════════════════════════════════════════════════
router.post('/admin/login',  loginLimiter, loginAdmin);

// Création de compte : réservé à un admin connecté.
// Exception : si AUCUN admin n'existe encore, on autorise le 1er
// (amorçage) — sinon le compte serait inatteignable.
const allowCreateAdmin = async (req, res, next) => {
    try {
        const supabase = require('../config/supabase');
        const { count } = await supabase
            .from('admins')
            .select('id', { count: 'exact', head: true });
        if (!count) return next(); // bootstrap : aucun compte
    } catch (err) {
        console.error(err);
    }
    return authMiddleware(req, res, next);
};

router.post('/admin/create', allowCreateAdmin, createAdmin);

// Profil / identifiants de l'admin connecté
router.get('/admin/me',               authMiddleware, getProfile);
router.put('/admin/profile',          authMiddleware, updateProfile);
router.patch('/admin/profile',        authMiddleware, updateProfile);
router.put('/admin/password',         authMiddleware, updatePassword);
router.patch('/admin/password',       authMiddleware, updatePassword);


// ══════════════════════════════════════════════════════════════
//  TYPE DE PHOTOS  (catégories)
// ══════════════════════════════════════════════════════════════

router.get('/type-photos',              getTypePhotos);
router.get('/type-photos/:slug',        getTypePhotoBySlug);

router.get('/admin/type-photos',        authMiddleware, getAllTypePhotos);
router.post('/admin/type-photos',       authMiddleware, createTypePhoto);
router.put('/admin/type-photos/:id',    authMiddleware, updateTypePhoto);
router.patch('/admin/type-photos/:id',  authMiddleware, updateTypePhoto);
router.delete('/admin/type-photos/:id', authMiddleware, deleteTypePhoto);


// ══════════════════════════════════════════════════════════════
//  PHOTOS  (galerie)
// ══════════════════════════════════════════════════════════════

router.get('/photos',                       getPhotos);
router.get('/photos/par-categorie/:slug',   getPhotosBySlug);

router.get('/admin/photos',             authMiddleware, getAllPhotos);
router.post('/admin/photos',            authMiddleware, createPhoto);
router.put('/admin/photos/reorder',     authMiddleware, reorderPhotos);
router.put('/admin/photos/:id',         authMiddleware, updatePhoto);
router.patch('/admin/photos/:id',       authMiddleware, updatePhoto);
router.delete('/admin/photos/:id',      authMiddleware, deletePhoto);


// ══════════════════════════════════════════════════════════════
//  DISPONIBILITÉS
// ══════════════════════════════════════════════════════════════

router.get('/disponibilites',           getDisponibilites);

router.get('/admin/disponibilites',     authMiddleware, getAllDisponibilites);
router.post('/admin/disponibilites',    authMiddleware, createDisponibilite);
router.put('/admin/disponibilites/:id', authMiddleware, updateDisponibilite);
router.delete('/admin/disponibilites/:id', authMiddleware, deleteDisponibilite);

router.post('/admin/disponibilites/client', authMiddleware, createClientSlot);

router.get('/admin/activity-logs', authMiddleware, async (req, res) => {
  const supabase = require('../config/supabase');
  try {
    const { data, error } = await supabase
      .from('activity_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      console.error(error);
      return res.status(500).json({ message: 'Erreur lors de la récupération.' });
    }

    const actorIds = [...new Set((data || []).map(log => log.actor_id).filter(Boolean))];
    let actorEmails = {};
    if (actorIds.length > 0) {
      const { data: admins } = await supabase
        .from('admins')
        .select('id, email')
        .in('id', actorIds);
      actorEmails = Object.fromEntries((admins || []).map(admin => [admin.id, admin.email]));
    }

    return res.json({
      logs: (data || []).map(log => ({
        ...log,
        actor_email: log.actor_id ? actorEmails[log.actor_id] || null : null,
      })),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Erreur serveur.' });
  }
});

router.post('/admin/generate-slots', authMiddleware, async (req, res) => {
  const { pool } = require('../db/pool');
  const slotGenerator = require('../utils/slotGenerator');

  try {
    const slots = slotGenerator.generateSlots30Days();

    if (slots.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Aucun créneau généré (vérifier heures d\'ouverture)' 
      });
    }

    const client = await pool.connect();
    try {
      const query = `
        INSERT INTO disponibilites (date_dispo, heure_debut, heure_fin, est_reserve)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (date_dispo, heure_debut) DO NOTHING
      `;

      for (const slot of slots) {
        await client.query(query, [
          slot.date_dispo,
          slot.heure_debut,
          slot.heure_fin,
          slot.est_reserve || false
        ]);
      }

      client.release();

      res.status(201).json({
        success: true,
        message: `✅ ${slots.length} créneaux générés avec succès !`,
        count: slots.length,
        slots_sample: slots.slice(0, 5)
      });
    } catch (err) {
      client.release();
      throw err;
    }
  } catch (error) {
    console.error('❌ Erreur génération créneaux:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erreur lors de la génération des créneaux',
      error: error.message 
    });
  }
});


// ══════════════════════════════════════════════════════════════
//  RÉSERVATIONS
// ══════════════════════════════════════════════════════════════

// Pas de log du body ici : il contient nom, email et téléphone du client
router.post('/reservations', bookingLimiter, createReservation);

router.get('/admin/reservations',           authMiddleware, getAllReservations);
router.get('/admin/reservations/:id',       authMiddleware, getReservationById);
router.patch('/admin/reservations/:id',     authMiddleware, updateReservation);
router.put('/admin/reservations/:id',       authMiddleware, updateReservation);
router.patch('/admin/reservations/:id/statut', authMiddleware, updateStatutReservation);
router.put('/admin/reservations/:id/statut',    authMiddleware, updateStatutReservation);
router.delete('/admin/reservations/:id',    authMiddleware, deleteReservation);


module.exports = router;
