import 'dotenv/config';
import { supabaseAdmin } from '../helpers/supabaseAdmin';
async function main() {
  const admin = supabaseAdmin();
  const { data: machine } = await admin.from('machines').select('id, name, serial_number, client_id').eq('serial_number', 'TEST-SERIAL-GENOVA-001').maybeSingle();
  console.log('machine:', machine);
  if (machine?.client_id) {
    const { data: client } = await admin.from('clients').select('id, name').eq('id', machine.client_id).maybeSingle();
    console.log('client:', client);
  }
}
main();
