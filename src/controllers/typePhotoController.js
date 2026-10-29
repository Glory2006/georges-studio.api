const supabase = require('../config/supabase');
const { logActivity } = require('../utils/activityLogger');

// ══════════════════════════════════════════════════════════════
// TYPE_PHOTOS CONTROLLER
// Gère les catégories de séances photo proposées par le studio.
// Exemples : mariage, portrait, grossesse, baptême…
// Les clients voient les catégories actives.
// L'admin peut tout gérer (créer, modifier, activer/désactiver).
// ══════════════════════════════════════════════════════════════


// ── [PUBLIC] Lister les catégories actives ─────────────────────
// Affichées sur le site client pour que le visiteur choisisse
// le type de séance qu'il souhaite réserver.
async function getTypePhotos(req, res) {
    try {
        const { data, error } = await supabase
            .from('type_photos')
            .select(`
                id,
                nom,
                description,
                slug,
                prix_indicatif,
                photos ( count )
            `)
            .eq('is_active', true)
            .order('nom', { ascending: true });

        if (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erreur lors de la récupération.' });
        }

        const typePhotosWithCount = data.map(item => {
            const { photos, ...rest } = item;
            return {
                ...rest,
                nbPhotos: photos?.[0]?.count ?? 0
            };
        });

        return res.json({ type_photos: typePhotosWithCount });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Erreur serveur.' });
    }
}


// ── [PUBLIC] Détail d'une catégorie par slug ───────────────────
// Ex : GET /type-photos/mariage
// Le slug est plus lisible dans l'URL qu'un UUID.
async function getTypePhotoBySlug(req, res) {
    try {
        const { slug } = req.params;

        const { data, error } = await supabase
            .from('type_photos')
            .select('id, nom, description, slug, prix_indicatif')
            .eq('slug', slug)
            .eq('is_active', true)
            .single();

        if (error || !data) {
            return res.status(404).json({ message: 'Catégorie introuvable.' });
        }

        return res.json({ type_photo: data });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Erreur serveur.' });
    }
}


// ── [ADMIN] Lister toutes les catégories ──────────────────────
// L'admin voit aussi les catégories désactivées (is_active = false).
async function getAllTypePhotos(req, res) {
    try {
        const { data, error } = await supabase
            .from('type_photos')
            .select(`
                id,
                nom,
                description,
                slug,
                prix_indicatif,
                is_active,
                created_at,
                photos ( count )
            `)
            .order('created_at', { ascending: false });

        if (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erreur lors de la récupération.' });
        }

        const typePhotosWithCount = data.map(item => {
            const { photos, ...rest } = item;
            return {
                ...rest,
                nbPhotos: photos?.[0]?.count ?? 0
            };
        });

        return res.json({ type_photos: typePhotosWithCount });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Erreur serveur.' });
    }
}


// ── [ADMIN] Créer une catégorie ────────────────────────────────
// Le slug doit être unique et en minuscules (ex: "mariage").
// Il sera utilisé dans les URLs du site.
async function createTypePhoto(req, res) {
    try {
        const { nom, description, slug, prix_indicatif } = req.body;

        if (!nom || !slug) {
            return res.status(400).json({ message: 'nom et slug sont obligatoires.' });
        }

        // Normalise le slug : minuscules, sans espaces
        const slugNormalise = slug.toLowerCase().trim().replace(/\s+/g, '-');

        // Vérifie l'unicité du slug
        const { data: existing } = await supabase
            .from('type_photos')
            .select('id')
            .eq('slug', slugNormalise)
            .single();

        if (existing) {
            return res.status(409).json({ message: 'Ce slug est déjà utilisé.' });
        }

        const { data, error } = await supabase
            .from('type_photos')
            .insert({
                nom,
                description: description || null,
                slug: slugNormalise,
                prix_indicatif: prix_indicatif || null,
                is_active: true
            })
            .select()
            .single();

        if (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erreur lors de la création.' });
        }
        await logActivity({
            actorType: 'admin',
            actorId: req.adminId,
            action: 'creation',
            entityType: 'type_photo',
            entityId: data.id,
            description: `Type de séance créé : ${data.nom}`,
        });

        return res.status(201).json({
            message: 'Catégorie créée avec succès.',
            type_photo: data
        });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Erreur serveur.' });
    }
}


// ── [ADMIN] Modifier une catégorie ────────────────────────────
// Tous les champs sont optionnels — seuls ceux fournis seront mis à jour.
async function updateTypePhoto(req, res) {
    try {
        const { id } = req.params;
        const { nom, description, slug, prix_indicatif, is_active } = req.body;

        const updates = {};
        if (nom !== undefined) updates.nom = nom;
        if (description !== undefined) updates.description = description;
        if (prix_indicatif !== undefined) updates.prix_indicatif = prix_indicatif;
        if (is_active !== undefined) updates.is_active = is_active;

        // Si le slug est modifié, on le normalise et vérifie l'unicité
        if (slug !== undefined) {
            const slugNormalise = slug.toLowerCase().trim().replace(/\s+/g, '-');

            const { data: existing } = await supabase
                .from('type_photos')
                .select('id')
                .eq('slug', slugNormalise)
                .neq('id', id) // exclut la ligne en cours de modification
                .single();

            if (existing) {
                return res.status(409).json({ message: 'Ce slug est déjà utilisé par une autre catégorie.' });
            }

            updates.slug = slugNormalise;
        }

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ message: 'Aucune donnée à mettre à jour.' });
        }

        const { data, error } = await supabase
            .from('type_photos')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erreur lors de la modification.' });
        }

        let action = 'modification';
        let logDescription = `Catégorie modifiée : ${data.nom}`;

        if (updates.is_active !== undefined) {
            action = updates.is_active ? 'publication' : 'depublication';
            logDescription = `${data.nom} ${updates.is_active ? 'publié' : 'dépublié'}`;
        }

        await logActivity({
            actorType: 'admin',
            actorId: req.adminId,
            action,
            entityType: 'type_photo',
            entityId: id,
            description:logDescription,
            metadata: updates,
        });

        return res.json({ message: 'Catégorie mise à jour.', type_photo: data });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Erreur serveur.' });
    }
}


// ── [ADMIN] Supprimer une catégorie ───────────────────────────
// ⚠️  Si des photos sont liées à cette catégorie,
// elles seront supprimées automatiquement (ON DELETE CASCADE dans le SQL).
// Les réservations liées échoueront (ON DELETE RESTRICT) — il faut
// d'abord les supprimer ou réassigner avant de supprimer la catégorie.
async function deleteTypePhoto(req, res) {
    try {
        const { id } = req.params;

        const { data: toDelete } = await supabase
            .from('type_photos')
            .select('nom')
            .eq('id', id)
            .single();

        const { error } = await supabase
            .from('type_photos')
            .delete()
            .eq('id', id);

        if (error) {
            if (error.code === '23503') {
                return res.status(409).json({
                    message: 'Impossible de supprimer : des réservations sont liées à cette catégorie.'
                });
            }
            console.error(error);
            return res.status(500).json({ message: 'Erreur lors de la suppression.' });
        }

        await logActivity({
            actorType: 'admin',
            actorId: req.adminId,
            action: 'suppression',
            entityType: 'type_photo',
            entityId: id,
            description: `Catégorie supprimée : ${toDelete?.nom || 'inconnue'}`,
        });

        return res.json({ message: 'Catégorie supprimée.' });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Erreur serveur.' });
    }
}


module.exports = {
    getTypePhotos,
    getTypePhotoBySlug,
    getAllTypePhotos,
    createTypePhoto,
    updateTypePhoto,
    deleteTypePhoto
};