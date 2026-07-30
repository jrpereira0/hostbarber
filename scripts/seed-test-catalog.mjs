import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Faltam NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const sb = createClient(url, key);
const PASSWORD = "Teste123!";
const OPEN_WEEKDAYS = [1, 2, 3, 4, 5, 6];

const PERMS = {
  can_book_clients: true,
  can_create_squeeze_in: true,
  can_open_comanda: true,
  can_edit_comanda: true,
  can_close_comanda: false,
  can_edit_appointments: true,
  can_cancel_appointments: true,
  can_manage_schedule_blocks: true,
};

const SHOPS = {
  "barbearia-011": {
    services: [
      {
        name: "Corte",
        description: "Corte masculino",
        price_cents: 4500,
        duration_minutes: 40,
      },
      {
        name: "Barba",
        description: "Barba completa",
        price_cents: 3500,
        duration_minutes: 30,
      },
      {
        name: "Corte + Barba",
        description: "Combo corte e barba",
        price_cents: 7000,
        duration_minutes: 60,
      },
      {
        name: "Sobrancelha",
        description: "Acabamento de sobrancelha",
        price_cents: 1500,
        duration_minutes: 15,
      },
      {
        name: "Pezinho",
        description: "Acabamento do pezinho",
        price_cents: 2000,
        duration_minutes: 20,
      },
    ],
    professionals: [
      {
        first_name: "Pedro",
        last_name: "Silva",
        nickname: "Pedro",
        email: "pedro@011.com",
        whatsapp: "11990001101",
        commission_percent: 50,
      },
      {
        first_name: "Rafael",
        last_name: "Souza",
        nickname: "Rafa",
        email: "rafa@011.com",
        whatsapp: "11990001102",
        commission_percent: 45,
      },
    ],
    categories: [
      { name: "Cuidados", sort_order: 1 },
      { name: "Bebidas", sort_order: 2 },
    ],
    products: [
      {
        name: "Pomada Modeladora",
        category: "Cuidados",
        price_cents: 3500,
        commission_percent: 20,
        stock_quantity: 15,
      },
      {
        name: "Minoxidil 5%",
        category: "Cuidados",
        price_cents: 8900,
        commission_percent: 15,
        stock_quantity: 8,
      },
      {
        name: "Água sem gás",
        category: "Bebidas",
        price_cents: 500,
        commission_percent: 10,
        stock_quantity: 40,
      },
      {
        name: "Refrigerante lata",
        category: "Bebidas",
        price_cents: 800,
        commission_percent: 10,
        stock_quantity: 30,
      },
    ],
  },
  "dinho-barber-coffee": {
    services: [
      {
        name: "Corte",
        description: "Corte masculino",
        price_cents: 5000,
        duration_minutes: 40,
      },
      {
        name: "Barba",
        description: "Barba com toalha quente",
        price_cents: 4000,
        duration_minutes: 30,
      },
      {
        name: "Corte + Barba",
        description: "Combo completo",
        price_cents: 8000,
        duration_minutes: 70,
      },
      {
        name: "Sobrancelha",
        description: "Design de sobrancelha",
        price_cents: 2000,
        duration_minutes: 15,
      },
      {
        name: "Hidratação",
        description: "Hidratação capilar",
        price_cents: 4500,
        duration_minutes: 30,
      },
    ],
    professionals: [
      {
        first_name: "Carlos",
        last_name: "Mendes",
        nickname: "Carlão",
        email: "carlos@dinho.com",
        whatsapp: "11990002201",
        commission_percent: 50,
      },
      {
        first_name: "Marcos",
        last_name: "Lima",
        nickname: "Marcos",
        email: "marcos@dinho.com",
        whatsapp: "11990002202",
        commission_percent: 45,
      },
    ],
    categories: [
      { name: "Cuidados", sort_order: 1 },
      { name: "Bebidas", sort_order: 2 },
      { name: "Café", sort_order: 3 },
    ],
    products: [
      {
        name: "Pomada Matte",
        category: "Cuidados",
        price_cents: 4200,
        commission_percent: 20,
        stock_quantity: 12,
      },
      {
        name: "Óleo de barba",
        category: "Cuidados",
        price_cents: 5500,
        commission_percent: 20,
        stock_quantity: 10,
      },
      {
        name: "Água com gás",
        category: "Bebidas",
        price_cents: 600,
        commission_percent: 10,
        stock_quantity: 24,
      },
      {
        name: "Espresso",
        category: "Café",
        price_cents: 700,
        commission_percent: 10,
        stock_quantity: 50,
      },
      {
        name: "Cappuccino",
        category: "Café",
        price_cents: 1200,
        commission_percent: 10,
        stock_quantity: 40,
      },
    ],
  },
};

async function ensureUser(email, password, fullName, shopId) {
  const listed = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
  const existing = (listed.data?.users || []).find(
    (u) => u.email?.toLowerCase() === email.toLowerCase()
  );
  let userId = existing?.id;
  if (!userId) {
    const { data, error } = await sb.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (error) throw new Error(`Auth ${email}: ${error.message}`);
    userId = data.user.id;
  } else {
    await sb.auth.admin.updateUserById(userId, {
      password,
      email_confirm: true,
    });
  }
  const { error: profileError } = await sb.from("profiles").upsert({
    id: userId,
    full_name: fullName,
    role: "barber",
    shop_id: shopId,
  });
  if (profileError) {
    throw new Error(`Profile ${email}: ${profileError.message}`);
  }
  return userId;
}

async function seedShop(shop) {
  const plan = SHOPS[shop.slug];
  if (!plan) {
    console.log(`Pulando ${shop.slug}`);
    return;
  }

  console.log(`\n=== ${shop.name} (${shop.slug}) ===`);

  for (const svc of plan.services) {
    const { data: existing } = await sb
      .from("services")
      .select("id")
      .eq("shop_id", shop.id)
      .eq("name", svc.name)
      .maybeSingle();

    let id = existing?.id;
    if (!id) {
      const { data, error } = await sb
        .from("services")
        .insert({
          shop_id: shop.id,
          name: svc.name,
          description: svc.description,
          price_cents: svc.price_cents,
          duration_minutes: svc.duration_minutes,
          active: true,
          price_from: false,
        })
        .select("id")
        .single();
      if (error) throw new Error(`Service ${svc.name}: ${error.message}`);
      id = data.id;
      console.log(`  + serviço ${svc.name}`);
    } else {
      console.log(`  = serviço ${svc.name} (já existe)`);
    }

    await sb.from("service_weekday_prices").delete().eq("service_id", id);
    const { error: priceError } = await sb.from("service_weekday_prices").insert(
      OPEN_WEEKDAYS.map((weekday) => ({
        service_id: id,
        weekday,
        price_cents: svc.price_cents,
      }))
    );
    if (priceError) {
      throw new Error(`Prices ${svc.name}: ${priceError.message}`);
    }
  }

  const { data: allServices } = await sb
    .from("services")
    .select("id")
    .eq("shop_id", shop.id)
    .eq("active", true);
  const allServiceIds = (allServices || []).map((s) => s.id);

  for (const pro of plan.professionals) {
    const { data: existingPro } = await sb
      .from("professionals")
      .select("id")
      .eq("shop_id", shop.id)
      .eq("email", pro.email)
      .maybeSingle();

    if (!existingPro?.id) {
      const profileId = await ensureUser(
        pro.email,
        PASSWORD,
        `${pro.first_name} ${pro.last_name}`,
        shop.id
      );
      const { error } = await sb.from("professionals").insert({
        shop_id: shop.id,
        first_name: pro.first_name,
        last_name: pro.last_name,
        nickname: pro.nickname,
        email: pro.email,
        whatsapp: pro.whatsapp,
        commission_percent: pro.commission_percent,
        profile_id: profileId,
        active: true,
        ...PERMS,
      });
      if (error) throw new Error(`Pro ${pro.nickname}: ${error.message}`);
      console.log(
        `  + profissional ${pro.nickname} (${pro.email} / ${PASSWORD})`
      );
    } else {
      console.log(`  = profissional ${pro.nickname} (já existe)`);
    }
  }

  const { data: existingPros } = await sb
    .from("professionals")
    .select("id, nickname")
    .eq("shop_id", shop.id)
    .eq("active", true);

  for (const pro of existingPros || []) {
    await sb.from("working_hours").delete().eq("professional_id", pro.id);
    const { error: hoursError } = await sb.from("working_hours").insert(
      OPEN_WEEKDAYS.map((weekday) => ({
        professional_id: pro.id,
        weekday,
        start_time: "09:00",
        end_time: "19:00",
        active: true,
      }))
    );
    if (hoursError) {
      throw new Error(`Hours ${pro.nickname}: ${hoursError.message}`);
    }

    await sb.from("professional_services").delete().eq("professional_id", pro.id);
    if (allServiceIds.length) {
      const { error: linkError } = await sb.from("professional_services").insert(
        allServiceIds.map((service_id) => ({
          professional_id: pro.id,
          service_id,
        }))
      );
      if (linkError) {
        throw new Error(`Links ${pro.nickname}: ${linkError.message}`);
      }
    }
    console.log(`  ~ grade/serviços: ${pro.nickname}`);
  }

  const categoryByName = new Map();
  for (const cat of plan.categories) {
    const { data: existing } = await sb
      .from("product_categories")
      .select("id")
      .eq("shop_id", shop.id)
      .eq("name", cat.name)
      .maybeSingle();

    let id = existing?.id;
    if (!id) {
      const { data, error } = await sb
        .from("product_categories")
        .insert({
          shop_id: shop.id,
          name: cat.name,
          sort_order: cat.sort_order,
          active: true,
        })
        .select("id")
        .single();
      if (error) throw new Error(`Category ${cat.name}: ${error.message}`);
      id = data.id;
      console.log(`  + categoria ${cat.name}`);
    } else {
      console.log(`  = categoria ${cat.name} (já existe)`);
    }
    categoryByName.set(cat.name, id);
  }

  for (const prod of plan.products) {
    const categoryId = categoryByName.get(prod.category);
    if (!categoryId) throw new Error(`Categoria ausente: ${prod.category}`);

    const { data: existing } = await sb
      .from("products")
      .select("id")
      .eq("shop_id", shop.id)
      .eq("name", prod.name)
      .maybeSingle();

    if (existing?.id) {
      console.log(`  = produto ${prod.name} (já existe)`);
      continue;
    }

    const { data, error } = await sb
      .from("products")
      .insert({
        shop_id: shop.id,
        category_id: categoryId,
        name: prod.name,
        description: "",
        price_cents: prod.price_cents,
        commission_percent: prod.commission_percent,
        stock_quantity: prod.stock_quantity,
        active: true,
      })
      .select("id")
      .single();
    if (error) throw new Error(`Product ${prod.name}: ${error.message}`);

    if (prod.stock_quantity > 0) {
      await sb.from("product_stock_movements").insert({
        product_id: data.id,
        delta: prod.stock_quantity,
        quantity_after: prod.stock_quantity,
        reason: "purchase",
        note: "Estoque inicial (seed de teste)",
      });
    }
    console.log(`  + produto ${prod.name}`);
  }
}

const { data: shops, error } = await sb
  .from("shops")
  .select("id, name, slug")
  .eq("active", true)
  .order("name");

if (error) {
  console.error(error);
  process.exit(1);
}

for (const shop of shops || []) {
  await seedShop(shop);
}

console.log("\nPronto.");
console.log("Senha dos barbeiros novos: Teste123!");
