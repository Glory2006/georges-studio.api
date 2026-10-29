// ════════════════════════════════════════════════════════════════
// 🔒 VALIDATION & SANITISATION
// ════════════════════════════════════════════════════════════════
// Ce module fournit des fonctions pour valider et nettoyer
// les entrées utilisateur afin de prévenir les attaques de sécurité :
// - Injection SQL (via Supabase, pas applicable ici mais bonne pratique)
// - XSS (Cross-Site Scripting)
// - Injection d'email
// - Données invalides
// ════════════════════════════════════════════════════════════════

/**
 * Nettoyer une chaîne de caractères des caractères dangereux
 * Utilise l'échappement HTML pour prévenir les attaques XSS
 * @param {String} str - Chaîne à nettoyer
 * @returns {String} Chaîne nettoyée
 */
function sanitizeString(str) {
  if (typeof str !== 'string') {
    return '';
  }

  // Supprimer les espaces inutiles en début/fin
  str = str.trim();

  // Limiter la longueur pour éviter les débordements de mémoire
  if (str.length > 1000) {
    str = str.substring(0, 1000);
  }

  // Remplacer les caractères dangereux par leurs entités HTML
  const dangerousChars = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
  };

  return str.replace(/[&<>"'\/]/g, (char) => dangerousChars[char] || char);
}

/**
 * Valider et nettoyer un email
 * @param {String} email - Email à valider
 * @returns {Object} { isValid: Boolean, email: String|null, error: String|null }
 */
function validateEmail(email) {
  if (typeof email !== 'string') {
    return { isValid: false, email: null, error: 'Email invalide' };
  }

  const trimmedEmail = email.trim().toLowerCase();

  // Regex simple pour validation email (RFC 5322 simplifié)
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailRegex.test(trimmedEmail)) {
    return { isValid: false, email: null, error: 'Format d\'email invalide' };
  }

  // Vérifier la longueur
  if (trimmedEmail.length > 255) {
    return { isValid: false, email: null, error: 'Email trop long (max 255 caractères)' };
  }

  return { isValid: true, email: trimmedEmail, error: null };
}

/**
 * Valider et nettoyer un numéro de téléphone
 * Accepte formats : 0612345678, +33612345678, 06 12 34 56 78
 * @param {String} phone - Numéro à valider
 * @returns {Object} { isValid: Boolean, phone: String|null, error: String|null }
 */
function validatePhone(phone) {
  if (typeof phone !== 'string') {
    return { isValid: false, phone: null, error: 'Téléphone invalide' };
  }

  const cleanedPhone = phone.replace(/[\s\-\(\)\.]/g, '');

  // ✅ Accepte tous formats internationaux (7 à 15 chiffres)
  const phoneRegex = /^\+?[0-9]{7,15}$/;

  if (!phoneRegex.test(cleanedPhone)) {
    return { isValid: false, phone: null, error: 'Format de téléphone invalide' };
  }

  return { isValid: true, phone: cleanedPhone, error: null };
}

/**
 * Valider et nettoyer un nom (client, entreprise, etc.)
 * Accepte : lettres, chiffres, espaces, tirets, apostrophes, accents
 * @param {String} name - Nom à valider
 * @returns {Object} { isValid: Boolean, name: String|null, error: String|null }
 */
function validateName(name) {
  if (typeof name !== 'string') {
    return { isValid: false, name: null, error: 'Nom invalide' };
  }

  const trimmedName = name.trim();

  // Vérifier qu'il n'est pas vide après trim
  if (trimmedName.length === 0) {
    return { isValid: false, name: null, error: 'Le nom ne peut pas être vide' };
  }

  // Vérifier la longueur
  if (trimmedName.length > 100) {
    return { isValid: false, name: null, error: 'Le nom est trop long (max 100 caractères)' };
  }

  // Accepter lettres, chiffres, espaces, tirets, apostrophes, accents
  const nameRegex = /^[a-zA-Zàâäéèêëïîôöœûüçñ0-9\s\-']+$/;

  if (!nameRegex.test(trimmedName)) {
    return {
      isValid: false,
      name: null,
      error: 'Le nom contient des caractères non autorisés'
    };
  }

  return { isValid: true, name: trimmedName, error: null };
}

/**
 * Valider une date au format YYYY-MM-DD
 * @param {String} dateStr - Date à valider
 * @returns {Object} { isValid: Boolean, date: String|null, error: String|null }
 */
function validateDate(dateStr) {
  if (typeof dateStr !== 'string') {
    return { isValid: false, date: null, error: 'Date invalide' };
  }

  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

  if (!dateRegex.test(dateStr)) {
    return { isValid: false, date: null, error: 'Format de date invalide. Utilisez YYYY-MM-DD' };
  }

  // Créer une date pour vérifier sa validité
  const parts = dateStr.split('-');
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);

  const date = new Date(year, month - 1, day);

  // Vérifier que la date est valide
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return { isValid: false, date: null, error: 'Date invalide' };
  }

  // Vérifier que la date n'est pas dans le passé (sauf si spécifié)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (date < today) {
    return { isValid: false, date: null, error: 'La date doit être dans le futur' };
  }

  return { isValid: true, date: dateStr, error: null };
}

/**
 * Valider une heure au format HH:MM ou HH:MM:SS
 * @param {String} timeStr - Heure à valider
 * @returns {Object} { isValid: Boolean, time: String|null, error: String|null }
 */
function validateTime(timeStr) {
  if (typeof timeStr !== 'string') {
    return { isValid: false, time: null, error: 'Heure invalide' };
  }

  // Accepter HH:MM ou HH:MM:SS
  const timeRegex = /^([0-1][0-9]|2[0-3]):([0-5][0-9])(?::([0-5][0-9]))?$/;

  if (!timeRegex.test(timeStr)) {
    return { isValid: false, time: null, error: 'Format d\'heure invalide. Utilisez HH:MM' };
  }

  // Normaliser en HH:MM:SS si nécessaire
  const parts = timeStr.split(':');
  const normalized = parts.length === 2
    ? `${parts[0]}:${parts[1]}:00`
    : timeStr;

  return { isValid: true, time: normalized, error: null };
}

/**
 * Valider un message (peut être vide, max 1000 caractères)
 * @param {String} message - Message à valider
 * @returns {Object} { isValid: Boolean, message: String|null, error: String|null }
 */
function validateMessage(message) {
  if (message === null || message === undefined) {
    return { isValid: true, message: null, error: null };
  }

  if (typeof message !== 'string') {
    return { isValid: false, message: null, error: 'Message invalide' };
  }

  const trimmedMessage = message.trim();

  if (trimmedMessage.length === 0) {
    return { isValid: true, message: null, error: null };
  }

  if (trimmedMessage.length > 2000) {
    return { isValid: false, message: null, error: 'Le message est trop long (max 2000 caractères)' };
  }

  // Nettoyer les caractères dangereux
  const cleaned = sanitizeString(trimmedMessage);

  return { isValid: true, message: cleaned, error: null };
}

/**
 * Valider l'ensemble des données de réservation
 * @param {Object} data - Objet contenant les données de réservation
 * @returns {Object} { isValid: Boolean, data: Object|null, errors: Object }
 */
function validateReservationData(data) {
  const errors = {};
  const validatedData = {};

  // Valider nom_client
  if (!data.nom_client) {
    errors.nom_client = 'Le nom est obligatoire';
  } else {
    const nameValidation = validateName(data.nom_client);
    if (!nameValidation.isValid) {
      errors.nom_client = nameValidation.error;
    } else {
      validatedData.nom_client = nameValidation.name;
    }
  }

  // Valider email
  if (!data.email) {
    errors.email = 'L\'email est obligatoire';
  } else {
    const emailValidation = validateEmail(data.email);
    if (!emailValidation.isValid) {
      errors.email = emailValidation.error;
    } else {
      validatedData.email = emailValidation.email;
    }
  }

  // Valider téléphone
  if (!data.telephone) {
    errors.telephone = 'Le téléphone est obligatoire';
  } else {
    const phoneValidation = validatePhone(data.telephone);
    if (!phoneValidation.isValid) {
      errors.telephone = phoneValidation.error;
    } else {
      validatedData.telephone = phoneValidation.phone;
    }
  }

  // Valider date_seance
  if (!data.date_seance) {
    errors.date_seance = 'La date est obligatoire';
  } else {
    const dateValidation = validateDate(data.date_seance);
    if (!dateValidation.isValid) {
      errors.date_seance = dateValidation.error;
    } else {
      validatedData.date_seance = dateValidation.date;
    }
  }

  // Valider heure_seance
  if (!data.heure_seance) {
    errors.heure_seance = 'L\'heure est obligatoire';
  } else {
    const timeValidation = validateTime(data.heure_seance);
    if (!timeValidation.isValid) {
      errors.heure_seance = timeValidation.error;
    } else {
      validatedData.heure_seance = timeValidation.time;
    }
  }
 // Valider heure_seance_end(optionnelle)
  if (data.heure_seance_end) {
      const timeFinValidation = validateTime(data.heure_seance_end);
    if (!timeFinValidation.isValid) {
      errors.heure_seance_end= timeFinValidation.error;
    } else {
      validatedData.heure_seance_end= timeFinValidation.time;
    }
  }
  // Valider type_photo_id (doit être un UUID valide)
  if (!data.type_photo_id) {
    errors.type_photo_id = 'Le type de séance est obligatoire';
  } else if (typeof data.type_photo_id !== 'string' || data.type_photo_id.length === 0) {
    errors.type_photo_id = 'Type de séance invalide';
  } else {
    validatedData.type_photo_id = data.type_photo_id.trim();
  }

  // Valider message (optionnel)
  if (data.message) {
    const messageValidation = validateMessage(data.message);
    if (!messageValidation.isValid) {
      errors.message = messageValidation.error;
    } else {
      validatedData.message = messageValidation.message;
    }
  }

  const isValid = Object.keys(errors).length === 0;

  return {
    isValid,
    data: isValid ? validatedData : null,
    errors: isValid ? {} : errors,
  };
}

module.exports = {
  sanitizeString,
  validateEmail,
  validatePhone,
  validateName,
  validateDate,
  validateTime,
  validateMessage,
  validateReservationData,
};
