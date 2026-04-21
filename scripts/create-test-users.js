
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function createTestUsers() {
  const users = [
    { email: 'jarred@mail.com', password: 'password', name: 'Jarred' },
    { email: 'tester@mail.com', password: 'password', name: 'Tester' }
  ];

  for (const user of users) {
    console.log(`Creating user: ${user.email}`);
    const { data, error } = await supabase.auth.admin.createUser({
      email: user.email,
      password: user.password,
      email_confirm: true,
      user_metadata: { name: user.name }
    });

    if (error) {
      if (error.message.includes('already exists')) {
        console.log(`User ${user.email} already exists.`);
      } else {
        console.error(`Error creating user ${user.email}:`, error.message);
      }
    } else {
      console.log(`User ${user.email} created successfully with ID: ${data.user.id}`);
      
      // Also ensure they have a profile
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert({ 
          id: data.user.id, 
          email: user.email, 
          name: user.name,
          privacy_level: 'public'
        });
      
      if (profileError) {
        console.error(`Error creating profile for ${user.email}:`, profileError.message);
      } else {
        console.log(`Profile for ${user.email} created successfully.`);
      }
    }
  }
}

createTestUsers();
