const supabase = require('../config/supabase');
const { logActivity } = require('../utils/activityLogger');
const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
// ══════════════════════════════════════════════════════════════
// PHOTOS CONTROLLER
// Gère la galerie d'images du studio.
// Chaque photo est liée à une catégorie (type_photos).
// Les URLs des images viennent de Cloudinary (upload géré côté frontend
// ou via un endpoint dédié avec le SDK Cloudinary).
// ══════════════════════════════════════════════════════════════


// ── [PUBLIC] Lister les photos visibles ───────────────────────
// Retourne les photos visibles, avec le nom de leur catégorie.
// Paramètre optionnel : ?type_id=<uuid> pour filtrer par catégorie.
async function getPhotos(req, res) {
    try {
        const { type_id } = req.query;

        let query = supabase
            .from('photos')
            .select(`
                id,
                url_image,
                legende,
                ordre,
                type_photos ( id, nom, slug )
            `)
            .eq('is_visible', true)
            .order('ordre', { ascending: true });

        if (type_id) {
            query = query.eq('type_id', type_id);
        }

        const { data, error } = await query;

        if (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erreur lors de la récupération.' });
        }

        return res.json({ photos: data });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Erreur serveur.' });
    }
}


// ── [PUBLIC] Lister les photos d'une catégorie par slug ────────
// Ex : GET /photos/par-categorie/mariage
// Plus lisible que de passer un UUID dans le frontend.
async function getPhotosBySlug(req, res) {
    try {
        const { slug } = req.params;

        // Récupère d'abord l'id de la catégorie depuis son slug
        const { data: typePhoto, error: typeError } = await supabase
            .from('type_photos')
            .select('id')
            .eq('slug', slug)
            .eq('is_active', true)
            .single();

        if (typeError || !typePhoto) {
            return res.status(404).json({ message: 'Catégorie introuvable.' });
        }

        const { data, error } = await supabase
            .from('photos')
            .select('id, url_image, legende, ordre')
            .eq('type_id', typePhoto.id)
            .eq('is_visible', true)
            .order('ordre', { ascending: true });

        if (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erreur lors de la récupération.' });
        }

        return res.json({ photos: data });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Erreur serveur.' });
    }
}


// ── [ADMIN] Lister toutes les photos ──────────────────────────
// L'admin voit toutes les photos, visibles ou non.
async function getAllPhotos(req, res) {
    try {
        const { type_id } = req.query;

        let query = supabase
            .from('photos')
            .select(`
                id,
                type_id,
                url_image,
                legende,
                ordre,
                is_visible,
                type_photos ( id, nom, slug )
            `)
            .order('ordre', { ascending: true });

        if (type_id) {
            query = query.eq('type_id', type_id);
        }

        const { data, error } = await query;

        if (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erreur lors de la récupération.' });
        }

        return res.json({ photos: data });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Erreur serveur.' });
    }
}


// ── [ADMIN] Ajouter une photo ──────────────────────────────────
// Si l'URL de l'image est au format base64, elle est uploadée sur Supabase Storage.
// Sinon, elle est enregistrée directement en base de données.
async function createPhoto(req, res) {
    try {
        const { type_id, url_image, legende, ordre } = req.body;

        if (!type_id || !url_image) {
            return res.status(400).json({ message: 'type_id et url_image sont obligatoires.' });
        }

        // Vérifie que la catégorie existe
        const { data: typePhoto, error: typeError } = await supabase
            .from('type_photos')
            .select('id, nom')
            .eq('id', type_id)
            .single();

        if (typeError || !typePhoto) {
            return res.status(404).json({ message: 'Catégorie introuvable.' });
        }

        let savedUrl = url_image;

        // Si l'image est en base64, on l'uploade sur Supabase Storage
        if (/^data:image\//i.test(url_image)) {
            const matches = url_image.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/i);
            if (!matches) {
                return res.status(400).json({ message: 'Format d\'image base64 invalide.' });
            }

            // Certains clients envoient image/jpg alors que le MIME standard est image/jpeg.
            const mimeType = matches[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : matches[1].toLowerCase();
            if (!ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) {
                return res.status(400).json({ message: 'Format image refusé. Formats acceptés : JPG, PNG et WEBP.' });
            }
            const base64Data = matches[2];
            const buffer = Buffer.from(base64Data, 'base64');

            if (!buffer.length) {
                return res.status(400).json({ message: 'Image vide ou base64 invalide.' });
            }

            // Génère un nom de fichier unique pour éviter les collisions
            const extension = mimeType === 'image/jpeg' ? 'jpg' : (mimeType.split('/')[1] || 'jpg');
            const filename = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}.${extension}`;

            // Upload le buffer dans le bucket 'photos'
            const { data: uploadData, error: uploadError } = await supabase
                .storage
                .from('photos')
                .upload(filename, buffer, {
                    contentType: mimeType,
                    upsert: true
                });

            if (uploadError) {
                console.error('Erreur Supabase Storage upload:', uploadError);
                return res.status(500).json({ message: 'Erreur lors de l\'envoi de l\'image sur le stockage.' });
            }

            // Récupère l'URL publique de l'image stockée
            const { data: urlData } = supabase
                .storage
                .from('photos')
                .getPublicUrl(filename);

            if (!urlData || !urlData.publicUrl) {
                return res.status(500).json({ message: 'Erreur lors de la récupération de l\'URL publique de l\'image.' });
            }

            savedUrl = urlData.publicUrl;
        }

        const { data, error } = await supabase
            .from('photos')
            .insert({
                type_id,
                url_image: savedUrl,
                legende: legende || null,
                ordre: ordre ?? 0,  // si non fourni, on met 0 par défaut
                is_visible: true
            })
            .select()
            .single();

        if (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erreur lors de l\'ajout.' });
        }

        await logActivity({
            actorType: 'admin',
            actorId: req.adminId,
            action: 'creation',
            entityType: 'photo',
            entityId: data.id,
            description: `Photo ajoutée au type "${typePhoto.nom || type_id}"`,
        });

        return res.status(201).json({
            message: 'Photo ajoutée avec succès.',
            photo: data
        });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Erreur serveur.' });
    }
}


// ── [ADMIN] Modifier une photo ─────────────────────────────────
// Permet de changer la légende, l'ordre d'affichage,
// la visibilité ou même la catégorie.
async function updatePhoto(req, res) {
    try {
        const { id } = req.params;
        const { legende, ordre, is_visible, type_id, url_image } = req.body;

        const updates = {};
        if (legende !== undefined) updates.legende = legende;
        if (ordre !== undefined) updates.ordre = ordre;
        if (is_visible !== undefined) updates.is_visible = is_visible;
        if (type_id !== undefined) updates.type_id = type_id;

        if (url_image !== undefined) {
            let savedUrl = url_image;
            if (/^data:image\//i.test(url_image)) {
                const matches = url_image.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/i);
                if (!matches) {
                    return res.status(400).json({ message: 'Format d\'image base64 invalide.' });
                }

                const mimeType = matches[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : matches[1].toLowerCase();
                if (!ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) {
                    return res.status(400).json({ message: 'Format image refusé. Formats acceptés : JPG, PNG et WEBP.' });
                }
                const base64Data = matches[2];
                const buffer = Buffer.from(base64Data, 'base64');
                if (!buffer.length) {
                    return res.status(400).json({ message: 'Image vide ou base64 invalide.' });
                }

                const extension = mimeType === 'image/jpeg' ? 'jpg' : (mimeType.split('/')[1] || 'jpg');
                const filename = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}.${extension}`;

                const { data: uploadData, error: uploadError } = await supabase
                    .storage
                    .from('photos')
                    .upload(filename, buffer, {
                        contentType: mimeType,
                        upsert: true
                    });

                if (uploadError) {
                    console.error('Erreur Supabase Storage upload:', uploadError);
                    return res.status(500).json({ message: 'Erreur lors de l\'envoi de l\'image sur le stockage.' });
                }

                const { data: urlData } = supabase
                    .storage
                    .from('photos')
                    .getPublicUrl(filename);

                if (!urlData || !urlData.publicUrl) {
                    return res.status(500).json({ message: 'Erreur lors de la récupération de l\'URL publique de l\'image.' });
                }

                savedUrl = urlData.publicUrl;
            }
            updates.url_image = savedUrl;
        }

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ message: 'Aucune donnée à mettre à jour.' });
        }

        const { data, error } = await supabase
            .from('photos')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erreur lors de la modification.' });
        }

        let action = 'modification';
        let description = 'Photo modifiée';

        if (is_visible !== undefined) {
            action = is_visible ? 'publication' : 'depublication';
            description = `Photo ${is_visible ? 'publiée' : 'dépubliée'}`;
        }

        await logActivity({
            actorType: 'admin',
            actorId: req.adminId,
            action,
            entityType: 'photo',
            entityId: id,
            description,
            metadata: updates,
        });

        return res.json({ message: 'Photo mise à jour.', photo: data });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Erreur serveur.' });
    }
}


// ── [ADMIN] Réordonner les photos ─────────────────────────────
// Reçoit un tableau d'objets { id, ordre } et met tout à jour.
// Utile pour un drag-and-drop dans l'interface d'administration.
// Ex body : { photos: [{ id: "uuid1", ordre: 1 }, { id: "uuid2", ordre: 2 }] }
async function reorderPhotos(req, res) {
    try {
        const { photos } = req.body;

        if (!Array.isArray(photos) || photos.length === 0) {
            return res.status(400).json({ message: 'Un tableau de photos est requis.' });
        }

        // Supabase ne supporte pas encore les upserts multiples en une requête proprement,
        // donc on fait les updates en parallèle avec Promise.all
        const updates = photos.map(({ id, ordre }) =>
            supabase
                .from('photos')
                .update({ ordre })
                .eq('id', id)
        );

        await Promise.all(updates);

        await logActivity({
            actorType: 'admin',
            actorId: req.adminId,
            action: 'modification',
            entityType: 'photo',
            description: `Ordre de ${photos.length} photo(s) réorganisé`,
            metadata: { photos },
        });

        return res.json({ message: 'Ordre des photos mis à jour.' });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Erreur serveur.' });
    }
}


// ── [ADMIN] Supprimer une photo ────────────────────────────────
// Supprime l'enregistrement en base de données ainsi que le fichier dans Supabase Storage.
async function deletePhoto(req, res) {
    try {
        const { id } = req.params;

        // Récupère d'abord l'URL de la photo pour savoir s'il faut la supprimer du stockage Supabase
        const { data: photo, error: fetchError } = await supabase
            .from('photos')
            .select('url_image')
            .eq('id', id)
            .single();

        if (photo && photo.url_image) {
            const urlImage = photo.url_image;
            // Vérifie si la photo est stockée dans notre bucket photos
            const storagePrefix = '/storage/v1/object/public/photos/';
            if (urlImage.includes(storagePrefix)) {
                // Extrait le nom du fichier
                const filename = urlImage.substring(urlImage.lastIndexOf('/') + 1);
                if (filename) {
                    const { error: storageError } = await supabase
                        .storage
                        .from('photos')
                        .remove([filename]);
                    
                    if (storageError) {
                        console.error('Erreur lors de la suppression de la photo sur le stockage:', storageError);
                    }
                }
            }
        }

        const { error } = await supabase
            .from('photos')
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
            entityType: 'photo',
            entityId: id,
            description: 'Photo supprimée de la galerie',
        });

        return res.json({ message: 'Photo supprimée de la galerie.' });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Erreur serveur.' });
    }
}


module.exports = {
    getPhotos,
    getPhotosBySlug,
    getAllPhotos,
    createPhoto,
    updatePhoto,
    reorderPhotos,
    deletePhoto
};
