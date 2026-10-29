// ════════════════════════════════════════════════════════════════
// 🛠️ HELPER DISPONIBILITES - Générateur de créneaux
// ════════════════════════════════════════════════════════════════
// Ce fichier contient des fonctions utilitaires pour générer
// automatiquement les créneaux selon la configuration du studio
// ════════════════════════════════════════════════════════════════

const studioConfig = require('../config/studio');

/**
 * Générer les créneaux pour une date donnée
 * Selon la config du studio (heures + durée)
 * @param {string} dateStr - Date au format YYYY-MM-DD
 * @returns {Array} Tableau des créneaux [ { heure_debut, heure_fin }, ... ]
 */
function generateSlotsForDate(dateStr) {
  const config = studioConfig.getStudioConfig();
  const slots = [];

  // Parser les heures d'ouverture/fermeture
  const [openHour, openMin] = config.opening_time.split(':').map(Number);
  const [closeHour, closeMin] = config.closing_time.split(':').map(Number);
  
  // Convertir en minutes pour plus facile de calculer
  const openMinutes = openHour * 60 + openMin;
  const closeMinutes = closeHour * 60 + closeMin;
  const slotDuration = config.default_slot_duration || 60;

  // Générer les créneaux
  for (let current = openMinutes; current + slotDuration <= closeMinutes; current += slotDuration) {
    // Convertir back en HH:MM:SS
    const startHours = Math.floor(current / 60);
    const startMins = current % 60;
    const heure_debut = `${String(startHours).padStart(2, '0')}:${String(startMins).padStart(2, '0')}:00`;

    const endTime = current + slotDuration;
    const endHours = Math.floor(endTime / 60);
    const endMins = endTime % 60;
    const heure_fin = `${String(endHours).padStart(2, '0')}:${String(endMins).padStart(2, '0')}:00`;

    slots.push({
      date_dispo: dateStr,
      heure_debut,
      heure_fin,
      est_reserve: false
    });
  }

  return slots;
}

/**
 * Générer les créneaux pour un range de dates
 * @param {string} startDate - Date début (YYYY-MM-DD)
 * @param {string} endDate - Date fin (YYYY-MM-DD)
 * @returns {Array} Tous les créneaux pour chaque jour
 */
function generateSlotsForDateRange(startDate, endDate) {
  const slots = [];
  const start = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0];
    const daySlots = generateSlotsForDate(dateStr);
    slots.push(...daySlots);
  }

  return slots;
}

/**
 * Générer les créneaux pour les 30 prochains jours
 * Utile pour initialiser la plateforme
 * @returns {Array} Créneaux pour les 30 jours
 */
function generateSlots30Days() {
  const today = new Date();
  const today_str = today.toISOString().split('T')[0];
  
  const future = new Date(today);
  future.setDate(future.getDate() + 30);
  const future_str = future.toISOString().split('T')[0];

  return generateSlotsForDateRange(today_str, future_str);
}

module.exports = {
  generateSlotsForDate,
  generateSlotsForDateRange,
  generateSlots30Days
};
