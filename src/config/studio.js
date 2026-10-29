// ════════════════════════════════════════════════════════════════
// 📌 CONFIGURATION DU STUDIO
// ════════════════════════════════════════════════════════════════
// Ce fichier contient la configuration globale du studio :
// - Heures d'ouverture et de fermeture
// - Durée par défaut des créneaux
// - Les administrateurs peuvent modifier ces valeurs directement ici
// ════════════════════════════════════════════════════════════════

const STUDIO_CONFIG = {
  // Heure d'ouverture du studio (format HH:MM)
  opening_time: '09:00',

  // Heure de fermeture du studio (format HH:MM)
  closing_time: '20:00',

  // Durée par défaut d'un créneau en minutes
  // Les administrateurs peuvent modifier cette valeur selon leurs besoins
  default_slot_duration: 60, // 1 heure

  // Intervalle minimum entre les créneaux (en minutes)
  // Utile pour laisser du temps entre les séances
  slot_interval: 0, // 0 = pas d'intervalle entre les créneaux

  // Délai d'annulation (en heures avant la séance)
  // Client ne peut annuler que si la séance est dans plus de X heures
  cancellation_deadline: 24,
};

/**
 * Obtenir la configuration actuelle du studio
 * @returns {Object} Configuration du studio
 */
function getStudioConfig() {
  return STUDIO_CONFIG;
}

function applyStudioConfig(updates = {}) {
  return updateStudioConfig(updates);
}

/**
 * Mettre à jour la configuration du studio
 * @param {Object} updates - Objet contenant les champs à mettre à jour
 * @returns {Object} Configuration mise à jour
 */
function updateStudioConfig(updates = {}) {
  // Validation : vérifier que les heures sont au bon format
  if (updates.opening_time && !isValidTime(updates.opening_time)) {
    throw new Error('Format d\'heure d\'ouverture invalide. Utilisez HH:MM (ex: 09:00)');
  }
  if (updates.closing_time && !isValidTime(updates.closing_time)) {
    throw new Error('Format d\'heure de fermeture invalide. Utilisez HH:MM (ex: 20:00)');
  }

  // Vérifier que l'heure de fermeture est après l'heure d'ouverture
  const openingTime = updates.opening_time || STUDIO_CONFIG.opening_time;
  const closingTime = updates.closing_time || STUDIO_CONFIG.closing_time;
  if (openingTime >= closingTime) {
    throw new Error('L\'heure de fermeture doit être après l\'heure d\'ouverture');
  }

  // Validation : durée du créneau
  if (updates.default_slot_duration) {
    if (typeof updates.default_slot_duration !== 'number' || updates.default_slot_duration <= 0) {
      throw new Error('La durée du créneau doit être un nombre positif (en minutes)');
    }
  }

  // Mise à jour sécurisée
  Object.assign(STUDIO_CONFIG, updates);
  return STUDIO_CONFIG;
}

/**
 * Valider le format HH:MM d'une heure
 * @param {String} time - Format HH:MM à valider
 * @returns {Boolean} true si valide, false sinon
 */
function isValidTime(time) {
  if (typeof time !== 'string') return false;
  const timeRegex = /^([0-1][0-9]|2[0-3]):([0-5][0-9])$/;
  return timeRegex.test(time);
}

/**
 * Convertir HH:MM en minutes depuis minuit
 * Utile pour les comparaisons d'heures
 * @param {String} time - Format HH:MM
 * @returns {Number} Nombre de minutes depuis minuit
 */
function timeToMinutes(time) {
  if (!isValidTime(time)) {
    throw new Error(`Heure invalide : ${time}`);
  }
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Convertir les minutes depuis minuit en HH:MM
 * @param {Number} minutes - Nombre de minutes
 * @returns {String} Format HH:MM
 */
function minutesToTime(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

/**
 * Générer tous les créneaux disponibles entre opening et closing time
 * @returns {Array} Tableau des créneaux [{ start: '09:00', end: '10:00' }, ...]
 */
function generateAvailableTimeSlots() {
  const slots = [];
  const duration = STUDIO_CONFIG.default_slot_duration;
  const startMinutes = timeToMinutes(STUDIO_CONFIG.opening_time);
  const endMinutes = timeToMinutes(STUDIO_CONFIG.closing_time);

  for (let current = startMinutes; current + duration <= endMinutes; current += duration) {
    const start = minutesToTime(current);
    const end = minutesToTime(current + duration);
    slots.push({ start, end });
  }

  return slots;
}

/**
 * Vérifier si une heure donnée est dans les heures d'ouverture
 * @param {String} time - Format HH:MM
 * @returns {Boolean} true si entre opening et closing time
 */
function isWithinBusinessHours(time) {
  if (!isValidTime(time)) return false;
  const timeMin = timeToMinutes(time);
  const openMin = timeToMinutes(STUDIO_CONFIG.opening_time);
  const closeMin = timeToMinutes(STUDIO_CONFIG.closing_time);
  return timeMin >= openMin && timeMin < closeMin;
}

/**
 * Vérifier si une heure est passée pour le jour actuel
 * @param {String} dateStr - Format YYYY-MM-DD
 * @param {String} timeStr - Format HH:MM
 * @returns {Boolean} true si l'heure est dans le passé
 */
function isTimeInPast(dateStr, timeStr) {
  try {
    const now = new Date();
    const today = now.toISOString().split('T')[0];

    if (dateStr < today) return true;

    // ✅ Toute la journée (00:00) n'est jamais "passée" pour aujourd'hui ou le futur
    const isFullDay = timeStr === '00:00:00' || timeStr === '00:00';
    if (isFullDay) return false;

    if (dateStr === today) {
      const [bookingHours, bookingMinutes] = timeStr.split(':').map(Number);
      const bookingTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), bookingHours, bookingMinutes);
      return bookingTime <= now;
    }

    return false;
  } catch (err) {
    console.error('Erreur dans isTimeInPast :', err);
    return false;
  }
}
module.exports = {
  getStudioConfig,
  applyStudioConfig,
  updateStudioConfig,
  isValidTime,
  timeToMinutes,
  minutesToTime,
  generateAvailableTimeSlots,
  isWithinBusinessHours,
  isTimeInPast,
};
