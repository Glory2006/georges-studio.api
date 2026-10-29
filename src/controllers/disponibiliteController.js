const supabase = require('../config/supabase');
const studioConfig = require('../config/studio');
const { logActivity } = require('../utils/activityLogger');

// ══════════════════════════════════════════════════════════════
// DISPONIBILITES CONTROLLER
// Ce controller gère les créneaux horaires définis par l'admin.
// Le client peut voir les créneaux libres pour choisir sa date.
// L'admin peut créer, modifier ou supprimer des créneaux.
// ══════════════════════════════════════════════════════════════


// ── [PUBLIC] Lister les créneaux disponibles ───────────────────
// Retourne les créneaux du studio et la liste anonymisée des réservations actives.
// Le frontend affiche les créneaux en attente/réservés, mais les désactive.
// Paramètre optionnel : ?date=2025-08-15 pour filtrer par jour
async function getDisponibilites(req, res) {
    try {
        const { date } = req.query;

        // 1. Récupérer toutes les réservations actives (en attente ou acceptées)
        const { data: activeReservations, error: activeError } = await supabase
            .from('reservations')
            .select('disponibilite_id, date_seance, heure_seance,heure_seance_end, statut')
            .in('statut', ['en_attente', 'accepte']);

        if (activeError) {
            console.error(activeError);
            return res.status(500).json({ message: 'Erreur lors de la récupération des réservations actives.' });
        }

        // Préparer les créneaux bloqués avec le statut (inclut les dates/heures de réservations sans créneaux définis)
        const blockedBookings = activeReservations
            ? activeReservations.map(r => ({
                disponibilite_id: r.disponibilite_id,
                date_seance: r.date_seance,
                heure_seance: r.heure_seance,
                heure_seance_end: r.heure_seance_end,
                statut: r.statut // 'en_attente' ou 'accepte'
              }))
            : [];

        // 2. Récupérer les créneaux officiels. Les créneaux occupés sont renvoyés
        // sans données client pour pouvoir être affichés comme non sélectionnables.
        let query = supabase
            .from('disponibilites')
            .select('id, date_dispo, heure_debut, heure_fin, est_reserve')
            .order('date_dispo', { ascending: true })
            .order('heure_debut', { ascending: true });

        if (date) {
            query = query.eq('date_dispo', date);
        }

        const { data, error } = await query;

        if (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erreur lors de la récupération.' });
        }

        return res.json({ 
            disponibilites: data,
            blocked_bookings: blockedBookings
        });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Erreur serveur.' });
    }
}


// ── [ADMIN] Lister TOUS les créneaux ──────────────────────────
// Contrairement à la route publique, l'admin voit tout :
// créneaux libres ET réservés.
async function getAllDisponibilites(req, res) {
    try {
        const { data, error } = await supabase
            .from('disponibilites')
            .select('*')
            .order('date_dispo', { ascending: true })
            .order('heure_debut', { ascending: true });

        if (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erreur lors de la récupération.' });
        }

        return res.json({ disponibilites: data });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Erreur serveur.' });
    }
}


// ── [ADMIN] Créer un créneau ───────────────────────────────────
// L'admin définit une plage horaire pour une date donnée.
// La contrainte SQL UNIQUE (date_dispo, heure_debut) empêche les doublons.
// 🔒 IMPORTANT : Les heures doivent respecter la configuration du studio
async function createDisponibilite(req, res) {
    try {
        const { date_dispo, heure_debut, heure_fin } = req.body;

        if (!date_dispo || !heure_debut || !heure_fin) {
            return res.status(400).json({ message: 'date_dispo, heure_debut et heure_fin sont obligatoires.' });
        }

        const studioHours = studioConfig.getStudioConfig();
        
        if (!studioConfig.isWithinBusinessHours(heure_debut.substring(0, 5))) {
            return res.status(400).json({
                message: `heure_debut doit être entre ${studioHours.opening_time} et ${studioHours.closing_time}`
            });
        }

        if (!studioConfig.isWithinBusinessHours(heure_fin.substring(0, 5))) {
            return res.status(400).json({
                message: `heure_fin doit être entre ${studioHours.opening_time} et ${studioHours.closing_time}`
            });
        }

        if (heure_fin <= heure_debut) {
            return res.status(400).json({ message: 'heure_fin doit être après heure_debut.' });
        }

        const today = new Date().toISOString().split('T')[0];
        if (date_dispo < today) {
            return res.status(400).json({ message: 'Impossible de créer un créneau dans le passé.' });
        }

        // ← AJOUT : vérifier les conflits avec des réservations existantes
        const { data: conflicts, error: conflictError } = await supabase
            .from('reservations')
            .select('id, heure_seance, heure_seance_end')
            .in('statut', ['en_attente', 'accepte'])
            .eq('date_seance', date_dispo);

        if (conflictError) {
            console.error(conflictError);
            return res.status(500).json({ message: 'Erreur lors de la vérification des conflits.' });
        }

        const hasOverlap = conflicts?.some(r => {
            const rStart = r.heure_seance;
            const rEnd = r.heure_seance_end || r.heure_seance;
            // chevauchement si les plages horaires se croisent
            return heure_debut < rEnd && heure_fin > rStart;
        });

        if (hasOverlap) {
            return res.status(409).json({ message: 'Ce créneau chevauche une réservation existante.' });
        }

        const { data, error } = await supabase
            .from('disponibilites')
            .insert({ date_dispo, heure_debut, heure_fin })
            .select()
            .single();

        if (error) {
            if (error.code === '23505') {
                return res.status(409).json({ message: 'Un créneau existe déjà pour cette date et heure.' });
            }
            console.error(error);
            return res.status(500).json({ message: 'Erreur lors de la création.' });
        }

        await logActivity({
            actorType: 'admin',
            actorId: req.adminId,
            action: 'creation',
            entityType: 'disponibilite',
            entityId: data.id,
            description: `Créneau créé : ${data.date_dispo} de ${data.heure_debut.substring(0,5)} à ${data.heure_fin.substring(0,5)}`,
        });

        return res.status(201).json({
            message: 'Créneau créé avec succès.',
            disponibilite: data
        });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Erreur serveur.' });
    }
}

// ── [ADMIN] Modifier un créneau ────────────────────────────────
// Permet de changer la date ou les heures d'un créneau existant.
// Interdit si le créneau est déjà réservé.
async function updateDisponibilite(req, res) {
    try {
        const { id } = req.params;
        const { date_dispo, heure_debut, heure_fin } = req.body;

        // Vérifie que le créneau existe et n'est pas déjà réservé
        const { data: existing, error: fetchError } = await supabase
            .from('disponibilites')
            .select('id, est_reserve')
            .eq('id', id)
            .single();

        if (fetchError || !existing) {
            return res.status(404).json({ message: 'Créneau introuvable.' });
        }

        if (existing.est_reserve) {
            return res.status(403).json({ message: 'Impossible de modifier un créneau déjà réservé.' });
        }

        const updates = {};
        if (date_dispo) updates.date_dispo = date_dispo;
        if (heure_debut) updates.heure_debut = heure_debut;
        if (heure_fin) updates.heure_fin = heure_fin;

        const { data, error } = await supabase
            .from('disponibilites')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erreur lors de la modification.' });
        }

        await logActivity({
            actorType: 'admin',
            actorId: req.adminId,
            action: 'modification',
            entityType: 'disponibilite',
            entityId: id,
            description: `Créneau modifié : ${data.date_dispo} ${data.heure_debut.substring(0,5)}-${data.heure_fin.substring(0,5)}`,
            metadata: updates,
        });

        return res.json({ message: 'Créneau modifié.', disponibilite: data });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Erreur serveur.' });
    }
}


// ── [ADMIN] Supprimer un créneau ───────────────────────────────
// Supprime un créneau libre. Si une réservation le référence,
// le champ disponibilite_id de la réservation passera à NULL
// (ON DELETE SET NULL défini dans le schéma SQL).
async function deleteDisponibilite(req, res) {
    try {
        const { id } = req.params;

        const { data: toDelete } = await supabase
            .from('disponibilites')
            .select('date_dispo, heure_debut, heure_fin')
            .eq('id', id)
            .single();

        const { error } = await supabase
            .from('disponibilites')
            .delete()
            .eq('id', id);

        if (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erreur lors de la suppression.' });
        }

        await logActivity({
            actorType: 'admin',
            actorId: req.adminId,
            action: 'suppression',
            entityType: 'disponibilite',
            entityId: id,
            description: toDelete
                ? `Créneau supprimé : ${toDelete.date_dispo} ${toDelete.heure_debut.substring(0,5)}-${toDelete.heure_fin.substring(0,5)}`
                : 'Créneau supprimé',
        });

        return res.json({ message: 'Créneau supprimé.' });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Erreur serveur.' });
    }
}
async function createClientSlot(req, res) {
    try {
        const { date_dispo, heure_debut, heure_fin, nom_client, email, telephone, type_photo_id, message } = req.body;

        if (!date_dispo || !heure_debut || !heure_fin || !nom_client || !email || !telephone || !type_photo_id) {
            return res.status(400).json({ message: 'Tous les champs sont obligatoires.' });
        }

        // Vérifie chevauchement avec réservations existantes
        const { data: conflicts, error: conflictError } = await supabase
            .from('reservations')
            .select('id, heure_seance, heure_seance_end')
            .in('statut', ['en_attente', 'accepte'])
            .eq('date_seance', date_dispo);

        if (conflictError) {
            console.error(conflictError);
            return res.status(500).json({ message: 'Erreur lors de la vérification.' });
        }

        const hasOverlap = conflicts?.some(r => {
            const rEnd = r.heure_seance_end || r.heure_seance;
            return heure_debut < rEnd && heure_fin > r.heure_seance;
        });

        if (hasOverlap) {
            return res.status(409).json({ message: 'Ce créneau chevauche une réservation existante.' });
        }

        // Crée la réservation directement avec statut "accepte"
        const { data: newReservation, error } = await supabase
            .from('reservations')
            .insert({
                type_photo_id,
                disponibilite_id: null,
                nom_client,
                telephone,
                email,
                date_seance: date_dispo,
                heure_seance: heure_debut,
                heure_seance_end: heure_fin,
                message: message || null,
                statut: 'accepte'
            })
            .select()
            .single();

        if (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erreur lors de la création.' });
        }

        const { sendAcceptanceEmail } = require('../utils/notifications');
        sendAcceptanceEmail(newReservation);

        await logActivity({
            actorType: 'admin',
            actorId: req.adminId,
            action: 'creation',
            entityType: 'reservation',
            entityId: newReservation.id,
            description: `Créneau créé par l'admin pour ${nom_client}`,
        });

        return res.status(201).json({
            message: 'Créneau et réservation créés avec succès.',
            reservation: newReservation
        });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Erreur serveur.' });
    }
}

module.exports = {
    getDisponibilites,
    getAllDisponibilites,
    createDisponibilite,
    updateDisponibilite,
    deleteDisponibilite,
    createClientSlot
};
