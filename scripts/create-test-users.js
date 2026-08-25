
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

// Helper to parse CLI flags (--flag=val or --flag val)
function getCliArg(...flagNames) {
  for (const flagName of flagNames) {
    const argPrefix = `--${flagName}=`;
    const foundArg = process.argv.find(arg => arg.startsWith(argPrefix));
    if (foundArg) {
      return foundArg.slice(argPrefix.length);
    }
    const flagIndex = process.argv.indexOf(`--${flagName}`);
    if (flagIndex !== -1 && process.argv[flagIndex + 1] && !process.argv[flagIndex + 1].startsWith('--')) {
      return process.argv[flagIndex + 1];
    }
  }
  return null;
}

const rawUrl = getCliArg('url') || process.env.NEXT_PUBLIC_SUPABASE_URL;
const rawKey = getCliArg('key', 'service-key', 'secret-key') || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

if (!rawUrl || !rawKey) {
  console.error('❌ Missing Supabase credentials:');
  console.error('   Please provide --url and --key CLI flags or set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const supabaseUrl = rawUrl.trim().replace(/^["']|["']$/g, '');
const supabaseServiceKey = rawKey.trim().replace(/^["']|["']$/g, '');

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function createTestUsers() {
  const cliEmail = getCliArg('email');
  const cliPassword = getCliArg('password');
  const cliName = getCliArg('name') || 'Smoke Test Runner';

  let users;
  if (cliEmail && cliPassword) {
    users = [{ email: cliEmail, password: cliPassword, name: cliName }];
  } else if (process.env.TEST_USER_EMAIL && process.env.TEST_USER_PASSWORD && process.env.TEST_USER_EMAIL !== 'jarred@mail.com') {
    users = [{ email: process.env.TEST_USER_EMAIL, password: process.env.TEST_USER_PASSWORD, name: process.env.TEST_USER_NAME || 'Smoke Test Runner' }];
  } else {
    users = [
      { email: 'jarred@mail.com', password: 'password', name: 'Jarred' },
      { email: 'tester@mail.com', password: 'password', name: 'Tester' }
    ];
  }

  console.log(`🌐 Target Database: ${supabaseUrl}`);
  console.log(`📋 Users to process: ${users.map(u => u.email).join(', ')}\n`);

  for (const user of users) {
    console.log(`▶ Processing user: ${user.email}`);
    let userId = null;

    const { data, error } = await supabase.auth.admin.createUser({
      email: user.email,
      password: user.password,
      email_confirm: true,
      user_metadata: { name: user.name }
    });

    if (error) {
      if (error.message.toLowerCase().includes('already') || error.message.toLowerCase().includes('exists')) {
        console.log(`  ℹ User already exists in Auth. Updating password & confirming email...`);
        const { data: listData, error: listError } = await supabase.auth.admin.listUsers();
        if (listError) {
          console.error(`  ❌ Error listing users:`, listError.message);
          continue;
        }
        const existing = listData?.users?.find(u => u.email?.toLowerCase() === user.email.toLowerCase());
        if (existing) {
          userId = existing.id;
          const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
            password: user.password,
            email_confirm: true,
            user_metadata: { name: user.name }
          });
          if (updateError) {
            console.error(`  ❌ Error updating user ${user.email}:`, updateError.message);
          } else {
            console.log(`  ✔ User updated successfully with ID: ${userId}`);
          }
        } else {
          console.warn(`  ⚠️ Could not locate existing user record for ${user.email}`);
        }
      } else {
        console.error(`  ❌ Error creating user ${user.email}:`, error.message);
      }
    } else {
      userId = data.user.id;
      console.log(`  ✔ User created successfully with ID: ${userId}`);
    }

    if (userId) {
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert({ 
          id: userId, 
          email: user.email, 
          name: user.name,
          privacy_level: 'public'
        });
      
      if (profileError) {
        console.error(`  ❌ Error upserting profile for ${user.email}:`, profileError.message);
      } else {
        console.log(`  ✔ Profile for ${user.email} verified/upserted.`);
      }
    }
    console.log('');
  }
}

createTestUsers().catch((err) => {
  console.error('Fatal error executing createTestUsers:', err);
  process.exit(1);
});

