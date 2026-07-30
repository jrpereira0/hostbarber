// Cria (ou promove) um superadmin da plataforma.
// Uso: npm run create-platform-admin -- email@exemplo.com senha123 "Nome Completo"
import { createClient } from "@supabase/supabase-js";

const [email, password, fullName] = process.argv.slice(2);

if (!email || !password || !fullName) {
  console.error(
    'Uso: npm run create-platform-admin -- email@exemplo.com senha123 "Nome Completo"'
  );
  process.exit(1);
}

const supabaseUrl =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    "Defina SUPABASE_URL (ou NEXT_PUBLIC_SUPABASE_URL) e SUPABASE_SERVICE_ROLE_KEY no .env.local"
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

let userId = null;

const listed = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
const existing = listed.data?.users?.find(
  (u) => u.email?.toLowerCase() === email.toLowerCase()
);

if (existing) {
  userId = existing.id;
  const { error: updateError } = await supabase.auth.admin.updateUserById(
    userId,
    {
      password,
      email_confirm: true,
      user_metadata: {
        ...existing.user_metadata,
        full_name: fullName,
        platform_admin: true,
      },
    }
  );
  if (updateError) {
    console.error("Erro ao atualizar usuario:", updateError.message);
    process.exit(1);
  }
  console.log(`Usuario ja existia; senha e metadata atualizados: ${email}`);
} else {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, platform_admin: true },
  });

  if (error || !data.user) {
    console.error("Erro ao criar usuario:", error?.message ?? "sem usuario");
    process.exit(1);
  }

  userId = data.user.id;
  console.log(`Usuario criado: ${email}`);
}

const { error: insertError } = await supabase.from("platform_admins").upsert({
  user_id: userId,
});

if (insertError) {
  console.error("Erro ao registrar platform_admin:", insertError.message);
  process.exit(1);
}

console.log(`Superadmin pronto. Acesse /plataforma/login com ${email}`);
