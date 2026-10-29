const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const supabase = require('../config/supabase');
const { validateEmail } = require('../utils/validation');
const { logActivity } = require('../utils/activityLogger');

const MIN_PASSWORD_LENGTH = 8;

function createToken(adminId) {
    return jwt.sign({ adminId }, process.env.JWT_SECRET, { expiresIn: '1d' });
}

// Cherche un admin par son id (table "admins", repli sur "admin")
async function findAdminById(id) {
    if (!id) return null;

    const byId = await supabase
        .from('admins')
        .select('*')
        .eq('id', id)
        .single();

    if (byId.data) return { ...byId.data, table: 'admins' };

    const legacy = await supabase
        .from('admin')
        .select('*')
        .eq('id', id)
        .single();

    if (legacy.data) return { ...legacy.data, table: 'admin' };

    return null;
}

async function findAdmin(login) {
    const byEmail = await supabase
        .from('admins')
        .select('*')
        .eq('email', login)
        .single();

    if (byEmail.data) {
        return byEmail.data;
    }

    const byUsername = await supabase
        .from('admin')
        .select('*')
        .eq('username', login)
        .single();

    return byUsername.data;
}

async function loginAdmin(req, res) {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: 'Email et mot de passe obligatoires.' });
    }

    const admin = await findAdmin(email);
    if (!admin) {
        return res.status(401).json({ message: 'Identifiants incorrects.' });
    }

    const passwordHash = admin.password || admin.password_hash;
    const passwordMatch = passwordHash ? await bcrypt.compare(password, passwordHash) : false;

    if (!passwordMatch) {
        return res.status(401).json({ message: 'Identifiants incorrects.' });
    }

    return res.json({
        token: createToken(admin.id),
        admin: { id: admin.id, email: admin.email || admin.username, role: admin.role || 'photographe' },
    });
}

async function createAdmin(req, res) {
    const { email, password, role = 'photographe' } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: 'Email et mot de passe obligatoires.' });
    }

    if (String(password).length < MIN_PASSWORD_LENGTH) {
        return res.status(400).json({ message: `Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.` });
    }

    if (!['photographe', 'developer'].includes(role)) {
        return res.status(400).json({ message: 'Le rôle doit être photographe ou developer.' });
    }

    const existing = await findAdmin(email);
    if (existing) {
        return res.status(409).json({ message: 'Cet identifiant est deja utilise.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    let created = await supabase
        .from('admins')
        .insert({ email, password: hashedPassword, role })
        .select('id, email, role')
        .single();

    if (created.error) {
        created = await supabase
            .from('admin')
            .insert({ username: email, password_hash: hashedPassword })
            .select('id, username')
            .single();
    }

    if (created.error) {
        return res.status(500).json({ message: 'Erreur lors de la creation.' });
    }

    return res.status(201).json({
        message: 'Admin cree avec succes.',
        admin: created.data,
    });
}


// ── [ADMIN] Profil courant ──────────────────────────────────────
// GET /admin/me
async function getProfile(req, res) {
    try {
        const admin = await findAdminById(req.adminId);
        if (!admin) {
            return res.status(404).json({ message: 'Compte introuvable.' });
        }

        return res.json({
            admin: {
                id: admin.id,
                email: admin.email || admin.username || null,
                username: admin.username || null,
                created_at: admin.created_at || null,
                role: admin.role || 'photographe',
            },
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Erreur serveur.' });
    }
}


// ── [ADMIN] Modifier l'email ────────────────────────────────────
// PUT /admin/profile  { email }
async function updateProfile(req, res) {
    try {
        const { email } = req.body;

        const check = validateEmail(email);
        if (!check.isValid) {
            return res.status(400).json({ message: check.error || 'Email invalide.' });
        }
        const emailNormalise = check.email;

        const admin = await findAdminById(req.adminId);
        if (!admin) {
            return res.status(404).json({ message: 'Compte introuvable.' });
        }

        const { data: used } = await supabase
            .from('admins')
            .select('id')
            .eq('email', emailNormalise)
            .neq('id', admin.id)
            .maybeSingle();
        if (used) {
            return res.status(409).json({ message: 'Cet email est déjà utilisé.' });
        }

        let updated;
        if (admin.table === 'admins') {
            updated = await supabase
                .from('admins')
                .update({ email: emailNormalise })
                .eq('id', admin.id)
                .select('*')
                .single();
        } else {
            updated = await supabase
                .from('admin')
                .update({ username: emailNormalise })
                .eq('id', admin.id)
                .select('*')
                .single();
        }

        if (updated.error) {
            console.error(updated.error);
            return res.status(500).json({ message: 'Erreur lors de la mise à jour.' });
        }

        await logActivity({
            actorType: 'admin',
            actorId: admin.id,
            action: 'modification',
            entityType: 'admin',
            entityId: admin.id,
            description: `Adresse e-mail administrateur modifiée (${admin.email || admin.username || 'compte'})`,
            metadata: { ancien_email: admin.email || admin.username || null, nouvel_email: emailNormalise },
        });

        return res.json({
            message: 'Profil mis à jour.',
            admin: {
                id: updated.data.id,
                email: updated.data.email || updated.data.username,
            },
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Erreur serveur.' });
    }
}


// ── [ADMIN] Changer le mot de passe ─────────────────────────────
// PUT /admin/password  { currentPassword, newPassword }
async function updatePassword(req, res) {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ message: 'Mot de passe actuel et nouveau mot de passe obligatoires.' });
        }
        if (String(newPassword).length < MIN_PASSWORD_LENGTH) {
            return res.status(400).json({ message: `Le nouveau mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.` });
        }

        const admin = await findAdminById(req.adminId);
        if (!admin) {
            return res.status(404).json({ message: 'Compte introuvable.' });
        }

        const current = await supabase
            .from(admin.table)
            .select('*')
            .eq('id', admin.id)
            .single();

        const hash = current.data?.password || current.data?.password_hash;
        if (!hash || !(await bcrypt.compare(String(currentPassword), hash))) {
            return res.status(401).json({ message: 'Mot de passe actuel incorrect.' });
        }

        const newHash = await bcrypt.hash(String(newPassword), 10);
        const payload = admin.table === 'admins' ? { password: newHash } : { password_hash: newHash };

        const { error } = await supabase.from(admin.table).update(payload).eq('id', admin.id);
        if (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erreur lors de la mise à jour du mot de passe.' });
        }

        await logActivity({
            actorType: 'admin',
            actorId: admin.id,
            action: 'modification',
            entityType: 'admin',
            entityId: admin.id,
            description: 'Mot de passe administrateur modifié',
            metadata: { type: 'mot_de_passe' },
        });

        return res.json({ message: 'Mot de passe mis à jour.' });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Erreur serveur.' });
    }
}

module.exports = { loginAdmin, createAdmin, getProfile, updateProfile, updatePassword };
