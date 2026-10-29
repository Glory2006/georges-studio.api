require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
if (!process.env.SUPABASE_URL || !supabaseKey) {
  throw new Error('SUPABASE_URL et une clé Supabase doivent être définies dans backend/.env');
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  supabaseKey
);

async function migrate() {
  const { error } = await supabase.rpc('exec_sql', {
    query: 'ALTER TABLE reservations ADD COLUMN IF NOT EXISTS heure_seance_end TIME;'
  });
  if (error) console.error(error);
  else console.log('✅ Migration réussie');
}

migrate();
