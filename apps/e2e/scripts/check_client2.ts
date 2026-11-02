import 'dotenv/config';
import { supabaseAdmin } from '../helpers/supabaseAdmin';
async function main() {
  const admin = supabaseAdmin();
  const { data } = await admin.from('clients').select('id, name, city, region').eq('id', '9b26568b-7709-4fb6-8249-58583691502d').maybeSingle();
  console.log(data);
}
main();
