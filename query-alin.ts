import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const url = process.env.VITE_SUPABASE_URL || '';
const key = process.env.VITE_SUPABASE_ANON_KEY || '';

const supabase = createClient(url, key);

async function check() {
  console.log('Querying ALIN AHMMED (16099)...');
  const { data: att, error } = await supabase
    .from('attendance')
    .select('*')
    .eq('employee_id', '16099')
    .order('date_iso');
  
  console.log(JSON.stringify(att, null, 2));
}

check();
