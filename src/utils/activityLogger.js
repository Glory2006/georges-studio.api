const supabase = require('../config/supabase');

async function logActivity({ actorType, actorId, action, entityType, entityId, description, metadata }) {
  try {
    await supabase.from('activity_logs').insert({
      actor_type: actorType,
      actor_id: actorId || null,
      action,
      entity_type: entityType,
      entity_id: entityId || null,
      description,
      metadata: metadata || null,
    });
  } catch (err) {
    console.error('❌ Erreur log activité :', err);
  }
}

module.exports = { logActivity };