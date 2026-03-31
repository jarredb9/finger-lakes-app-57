const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function createTestUser() {
  const email = `manual-test-${uuidv4()}@example.com`;
  const password = `pass-${uuidv4()}`;
  const name = `ManualUser-${uuidv4().substring(0, 8)}`;
  
  const { data, error } = await supabase.auth.admin.createUser({ 
      email, 
      password, 
      email_confirm: true,
      user_metadata: { name }
  });
  
  if (error || !data.user) throw new Error(`Failed to create test user: ${error?.message}`);
  
  await supabase.from('profiles').upsert({ 
      id: data.user.id, 
      email, 
      name,
      privacy_level: 'public' 
  });

  console.log(JSON.stringify({ id: data.user.id, email, password }));
}

createTestUser().catch(err => {
    console.error(err);
    process.exit(1);
});
