const supabase = require('../config/supabase');
const studioConfig = require('../config/studio');
const validation = require('../utils/validation');
const { sendAcceptanceEmail, sendNewReservationEmail } = require('../utils/notifications');
const { logActivity } = require('../utils/activityLogger');

// ══════════════════════════════════════════════════════════════
// RESERVATIONS CONTROLLER
// Ce controller gère les demandes de réservation des clients.
// Les clients soumettent une réservation SANS compte utilisateur.
// L'admin peut ensuite les voir et changer leur statut.
// ══════════════════════════════════════════════════════════════


// ── [PUBLIC] Créer une réservation ─────────────────────────────
// Appelé par le formulaire de contact/réservation du site client.
// Le client choisit un type de photo + un créneau disponible.
// IMPORTANT : Toutes les entrées sont validées et nettoyées
async function createReservation(req, res) {
    try {
        const {
            type_photo_id,
            disponibilite_id,
            nom_client,
            telephone,
            email,
            date_seance,
            heure_seance,
            heure_seance_end,
            message
        } = req.body;

        // ─────────────────────────────────────────────────────────
        // 🔒 VALIDATION & SANITISATION de toutes les entrées
        // ─────────────────────────────────────────────────────────
        const validationResult = validation.validateReservationData({
            type_photo_id,
            nom_client,
            telephone,
            email,
            date_seance,
            heure_seance,
            heure_seance_end,
            message
        });

        if (!validationResult.isValid) {
            return res.status(400).json({
                message: 'Données de réservation invalides.',
                errors: validationResult.errors
            });
        }
        // Utiliser les données validées et nettoyées
        const validatedData = validationResult.data;
        const requestedDispoId = typeof disponibilite_id === 'string' && disponibilite_id.trim()
            ? disponibilite_id.trim()
            : null;

        // Vérifie que le type de photo existe et est actif
        const { data: typePhoto, error: typeError } = await supabase
            .from('type_photos')
            .select('id, nom')
            .eq('id', validatedData.type_photo_id)
            .eq('is_active', true)
            .single();

        if (typeError || !typePhoto) {
            return res.status(404).json({ message: 'Type de photo introuvable ou inactif.' });
        }

        // ─────────────────────────────────────────────────────────
        // Vérifier que l'heure n'est pas déjà passée
        // ─────────────────────────────────────────────────────────
        if (studioConfig.isTimeInPast(validatedData.date_seance, validatedData.heure_seance)) {
            return res.status(400).json({ message: 'Vous ne pouvez pas réserver une heure qui est déjà passée.' });
        }

        // Vérifier que l'heure est dans les heures d'ouverture du studio
        const timeHours = validatedData.heure_seance.substring(0, 5); // Extraire HH:MM
        const isFullDayRequest = ['00:00:00', '00:00'].includes(validatedData.heure_seance);
        if (!isFullDayRequest && !studioConfig.isWithinBusinessHours(timeHours)) {
            return res.status(400).json({
                message: `L'heure doit être entre ${studioConfig.getStudioConfig().opening_time} et ${studioConfig.getStudioConfig().closing_time}`
            });
        }

        // Si un créneau est fourni, vérifie qu'il existe et qu'il n'est pas déjà réservé.
        if (requestedDispoId) {
            const { data: dispo, error: dispoError } = await supabase
                .from('disponibilites')
                .select('id, date_dispo, heure_debut, heure_fin, est_reserve')
                .eq('id', requestedDispoId)
                .single();

            if (dispoError || !dispo) {
                return res.status(404).json({ message: 'Créneau introuvable.' });
            }

            if (dispo.est_reserve) {
                return res.status(409).json({ message: 'Ce créneau est déjà réservé.' });
            }

            if (dispo.date_dispo !== validatedData.date_seance || dispo.heure_debut !== validatedData.heure_seance) {
                return res.status(400).json({ message: 'Le créneau choisi ne correspond pas à la date et à l\'heure envoyées.' });
            }
        }

        // Empêche deux clients de prendre le même horaire, même si la première
        // demande est encore en attente.
        let activeQuery = supabase
            .from('reservations')
            .select('id')
            .in('statut', ['en_attente', 'accepte'])
            .eq('date_seance', validatedData.date_seance);

        if (requestedDispoId) {
            activeQuery = activeQuery.eq('disponibilite_id', requestedDispoId);
        } else {
            activeQuery = activeQuery.eq('heure_seance', validatedData.heure_seance);
        }

        const { data: existingActive, error: existingError } = await activeQuery.limit(1);
        if (existingError) {
            console.error(existingError);
            return res.status(500).json({ message: 'Erreur lors de la vérification du créneau.' });
        }

        const { data: sameDayActive, error: sameDayError } = await supabase
            .from('reservations')
            .select('id, heure_seance')
            .in('statut', ['en_attente', 'accepte'])
            .eq('date_seance', validatedData.date_seance);

        if (sameDayError) {
            console.error(sameDayError);
            return res.status(500).json({ message: 'Erreur lors de la vérification du jour.' });
        }

        const hasFullDayBooking = sameDayActive?.some(r => ['00:00:00', '00:00'].includes(r.heure_seance));
        if ((existingActive && existingActive.length > 0) || hasFullDayBooking || (isFullDayRequest && sameDayActive?.length > 0)) {
            return res.status(409).json({ message: 'Ce créneau est déjà en attente ou réservé.' });
        }

        // ─────────────────────────────────────────────────────────
        // Insérer la réservation — statut par défaut : 'en_attente'
        // created_at est automatiquement défini par Supabase
        // ─────────────────────────────────────────────────────────
        const { data: newReservation, error } = await supabase
            .from('reservations')
            .insert({
                type_photo_id: validatedData.type_photo_id,
                disponibilite_id: requestedDispoId,
                nom_client: validatedData.nom_client,
                telephone: validatedData.telephone,
                email: validatedData.email,
                date_seance: validatedData.date_seance,
                heure_seance: validatedData.heure_seance,
                heure_seance_end: validatedData.heure_seance_end || null,
                message: validatedData.message || null,
                statut: 'en_attente'
            })
            .select()
            .single();

        if (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erreur lors de la réservation.' });
        }

        await logActivity({
            actorType: 'client',
            action: 'creation',
            entityType: 'reservation',
            entityId: newReservation.id,
            description: `Nouvelle demande de réservation par ${validatedData.nom_client}`,
        });

        // La réservation est déjà enregistrée : une panne d'e-mail ne doit
        // pas empêcher le client de recevoir la confirmation HTTP.
        void sendNewReservationEmail(newReservation, typePhoto.nom);

        return res.status(201).json({
            message: 'Réservation envoyée avec succès. Vous serez contacté prochainement.',
            reservation: newReservation
        });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Erreur serveur.' });
    }
}


// ── [ADMIN] Lister toutes les réservations ─────────────────────
// Retourne toutes les réservations avec les infos du type de photo.
// Paramètre optionnel : ?statut=en_attente | accepte | rejete
// IMPORTANT : Inclut la date d'enregistrement (created_at) et le type
async function getAllReservations(req, res) {
    try {
        const { statut } = req.query;

        let query = supabase
            .from('reservations')
            .select(`
                id,
                nom_client,
                telephone,
                email,
                date_seance,
                heure_seance,
                heure_seance_end,
                message,
                statut,
                disponibilite_id,
                created_at,
                updated_at,
                type_photos ( nom, prix_indicatif ),
                disponibilites ( date_dispo, heure_debut, heure_fin )
            `)
            .order('created_at', { ascending: false });

        // Filtre optionnel par statut
        if (statut) {
            query = query.eq('statut', statut);
        }

        const { data, error } = await query;

        if (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erreur lors de la récupération.' });
        }

        return res.json({ reservations: data });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Erreur serveur.' });
    }
}


// ── [ADMIN] Voir une réservation en détail ─────────────────────
async function getReservationById(req, res) {
    try {
        const { id } = req.params;

        const { data, error } = await supabase
            .from('reservations')
            .select(`
                *,
                type_photos ( nom, description, prix_indicatif ),
                disponibilites ( date_dispo, heure_debut, heure_fin )
            `)
            .eq('id', id)
            .single();

        if (error || !data) {
            return res.status(404).json({ message: 'Réservation introuvable.' });
        }

        return res.json({ reservation: data });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Erreur serveur.' });
    }
}


// ── [ADMIN] Changer le statut d'une réservation ────────────────
// L'admin accepte ou rejette une demande.
// Si acceptée : le créneau lié est marqué comme réservé (est_reserve = true).
// Si rejetée  : le créneau reste disponible.
async function updateStatutReservation(req, res) {
    try {
        const { id } = req.params;
        const { statut } = req.body;

        const statutsValides = ['en_attente', 'accepte', 'rejete'];
        if (!statut || !statutsValides.includes(statut)) {
            return res.status(400).json({ message: 'Statut invalide. Valeurs : en_attente, accepte, rejete.' });
        }

        // Récupère la réservation pour avoir l'id du créneau
        const { data: reservation, error: fetchError } = await supabase
            .from('reservations')
            .select('id, statut, disponibilite_id')
            .eq('id', id)
            .single();

        if (fetchError || !reservation) {
            return res.status(404).json({ message: 'Réservation introuvable.' });
        }

        // Met à jour le statut — le trigger SQL updated_at s'exécute automatiquement
        const { data: updated, error: updateError } = await supabase
            .from('reservations')
            .update({ statut })
            .eq('id', id)
            .select()
            .single();

        if (updateError) {
            console.error(updateError);
            return res.status(500).json({ message: 'Erreur lors de la mise à jour.' });
        }

        // Si acceptée et qu'un créneau est lié → le bloquer
        if (statut === 'accepte' && reservation.disponibilite_id) {
            await supabase
                .from('disponibilites')
                .update({ est_reserve: true })
                .eq('id', reservation.disponibilite_id);
        }
        if (statut === 'accepte') {
            sendAcceptanceEmail(updated);
        }

        // Si rejetée et que le créneau était bloqué → le libérer
        if (statut === 'rejete' && reservation.disponibilite_id) {
            await supabase
                .from('disponibilites')
                .update({ est_reserve: false })
                .eq('id', reservation.disponibilite_id);
        }
        await logActivity({
            actorType: 'admin',
            actorId: req.adminId,
            action: statut === 'accepte' ? 'acceptation' : statut === 'rejete' ? 'rejet' : 'modification',
            entityType: 'reservation',
            entityId: id,
            description: `Réservation de ${updated.nom_client} : ${statut}`,
        });

        return res.json({
            message: `Réservation ${statut} avec succès.`,
            reservation: updated
        });
        

    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Erreur serveur.' });
    }
}

// ── [ADMIN] Modifier la date, l'heure et/ou le statut d'une réservation ──
async function updateReservation(req, res) {
    try {
        const { id } = req.params;
        const { date_seance, heure_seance, heure_seance_end, statut, disponibilite_id } = req.body;

        const updates = {};
        const statutsValides = ['en_attente', 'accepte', 'rejete'];

        if (statut !== undefined) {
            if (!statutsValides.includes(statut)) {
                return res.status(400).json({ message: 'Statut invalide. Valeurs : en_attente, accepte, rejete.' });
            }
            updates.statut = statut;
        }

        if (date_seance !== undefined) {
            const dateValidation = validation.validateDate(date_seance);
            if (!dateValidation.isValid) {
                return res.status(400).json({ message: dateValidation.error });
            }
            updates.date_seance = dateValidation.date;
        }

        if (heure_seance !== undefined) {
            const timeValidation = validation.validateTime(heure_seance);
            if (!timeValidation.isValid) {
                return res.status(400).json({ message: timeValidation.error });
            }
            updates.heure_seance = timeValidation.time;
        }
        if (heure_seance_end !== undefined) {
            const timeFinValidation = validation.validateTime(heure_seance_end);
            if (!timeFinValidation.isValid) {
                return res.status(400).json({ message: timeFinValidation.error });
            }
            updates.heure_seance_end = timeFinValidation.time;
        }

        const { data: reservation, error: fetchError } = await supabase
            .from('reservations')
            .select('id, date_seance, heure_seance, disponibilite_id')
            .eq('id', id)
            .single();

        if (fetchError || !reservation) {
            return res.status(404).json({ message: 'Réservation introuvable.' });
        }

        const nextDate = updates.date_seance || reservation.date_seance;
        const nextTime = updates.heure_seance || reservation.heure_seance;
        const nextDispoId = disponibilite_id === undefined ? reservation.disponibilite_id : (disponibilite_id || null);

        if (studioConfig.isTimeInPast(nextDate, nextTime)) {
            return res.status(400).json({ message: 'Impossible de placer une réservation sur une heure passée.' });
        }

        const isFullDayRequest = ['00:00:00', '00:00'].includes(nextTime);
        if (!isFullDayRequest && !studioConfig.isWithinBusinessHours(nextTime.substring(0, 5))) {
            return res.status(400).json({
                message: `L'heure doit être entre ${studioConfig.getStudioConfig().opening_time} et ${studioConfig.getStudioConfig().closing_time}`
            });
        }

        const { data: conflicts, error: conflictError } = await supabase
            .from('reservations')
            .select('id, heure_seance')
            .in('statut', ['en_attente', 'accepte'])
            .eq('date_seance', nextDate)
            .neq('id', id);

        if (conflictError) {
            console.error(conflictError);
            return res.status(500).json({ message: 'Erreur lors de la vérification du créneau.' });
        }

        const sameHourConflict = conflicts?.some(r => r.heure_seance === nextTime);
        const fullDayConflict = conflicts?.some(r => ['00:00:00', '00:00'].includes(r.heure_seance));
        if (sameHourConflict || fullDayConflict || (isFullDayRequest && conflicts?.length > 0)) {
            return res.status(409).json({ message: 'Ce créneau est déjà en attente ou réservé.' });
        }

        updates.disponibilite_id = nextDispoId;

        const { data: updated, error: updateError } = await supabase
            .from('reservations')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (updateError) {
            console.error(updateError);
            return res.status(500).json({ message: 'Erreur lors de la modification.' });
        }

        if (reservation.disponibilite_id && reservation.disponibilite_id !== nextDispoId) {
            await supabase
                .from('disponibilites')
                .update({ est_reserve: false })
                .eq('id', reservation.disponibilite_id);
        }

        if (updates.statut === 'accepte' && nextDispoId) {
            await supabase
                .from('disponibilites')
                .update({ est_reserve: true })
                .eq('id', nextDispoId);
        }
        await logActivity({
            actorType: 'admin',
            actorId: req.adminId,
            action: 'modification',
            entityType: 'reservation',
            entityId: id,
            description: `Horaire modifié pour la réservation de ${reservation.nom_client || 'client'}`,
            metadata: { avant: { date_seance: reservation.date_seance, heure_seance: reservation.heure_seance }, apres: updates },
        });

        return res.json({ message: 'Réservation modifiée.', reservation: updated });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Erreur serveur.' });
    }
}

// ── [ADMIN] Supprimer une réservation ──────────────────────────
async function deleteReservation(req, res) {
    try {
        const { id } = req.params;

        const { data: toDelete } = await supabase
            .from('reservations')
            .select('nom_client')
            .eq('id', id)
            .single();

        const { error } = await supabase
            .from('reservations')
            .delete()
            .eq('id', id);

        if (error) {
            return res.status(500).json({ message: 'Erreur lors de la suppression.' });
        }

        await logActivity({
            actorType: 'admin',
            actorId: req.adminId,
            action: 'suppression',
            entityType: 'reservation',
            entityId: id,
            description: `Réservation de ${toDelete?.nom_client || 'client'} supprimée`,
        });

        return res.json({ message: 'Réservation supprimée.' });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Erreur serveur.' });
    }
}


module.exports = {
    createReservation,
    getAllReservations,
    getReservationById,
    updateReservation,
    updateStatutReservation,
    deleteReservation
};
