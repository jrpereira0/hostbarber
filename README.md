# HOSTBARBER

Sistema SaaS de agendamento para **várias barbearias**. Cada loja tem painel (`/admin`); a plataforma (`/plataforma`) gerencia os **clientes** (lojas). Os clientes finais agendam pelo site (`/agenda`) informando o **WhatsApp** (sem código de confirmação), consultam/remarcam/cancelam em **Horários**, veem o endereço em **Local** e editam o perfil em **Conta**.

Cada loja gerencia profissionais, serviços, clientes do salão, **produtos**, **comandas**, **caixa do dia** e **comissões**. Origem do agendamento na agenda: **painel** ou **site** (ícone no card).

## Tecnologias

- Next.js (App Router) + TypeScript
- Tailwind CSS + shadcn/ui
- Supabase (PostgreSQL, Auth e Storage)
- Zod (validação)

## Como rodar

1. Instale as dependências:

```bash
npm install
```

2. Copie `.env.example` para `.env.local` e preencha as variáveis.
3. Aplique as migrations: `npm run db:migrate`
4. Suba o site: `npm run dev`

### Superadmin da plataforma

```bash
npm run create-platform-admin -- seu@email.com senha123 "Seu Nome"
```

Acesse [http://localhost:3000/plataforma/login](http://localhost:3000/plataforma/login), cadastre um cliente (loja) e use o e-mail/senha do dono em `/login-admin`.

No primeiro acesso, o dono vê um **tour completo** do painel (modal + balões): todas as abas de Configurações, profissionais, serviços, produtos, clientes, agenda, caixa e financeiro.

O site público da loja fica em `/agenda/{slug}` (ex.: `/agenda/minha-barbearia`). A rota `/agenda` redireciona para a loja padrão (primeira ativa).

## Publicar na Vercel

No painel da Vercel, abra **Settings → Environment Variables** e cadastre:

| Variável | Para quê |
|---|---|
| `SUPABASE_URL` | Servidor (mesmo valor da URL do projeto) |
| `SUPABASE_ANON_KEY` | Servidor (chave publishable/anon) |
| `SUPABASE_SERVICE_ROLE_KEY` | API e ações do painel |
| `NEXT_PUBLIC_SUPABASE_URL` | Login no navegador (mesmo valor de `SUPABASE_URL`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Login no navegador (mesmo valor de `SUPABASE_ANON_KEY`) |
| `CLIENT_SESSION_SECRET` | **Obrigatória** — assina a sessão do cliente após informar o WhatsApp (32+ caracteres) |

Opcionais:

| Variável | Para quê |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | URL pública (Open Graph). Se omitir na Vercel, usa `VERCEL_URL` |
| `DATABASE_URL` | Rodar `npm run db:migrate` (só localmente) |

Não há chaves de API para barbearias: o site e o painel usam sessão (login do painel / WhatsApp do cliente no site).

Marque **Production**, **Preview** e **Development**.

### Região das Functions

O projeto usa `vercel.json` com região **`gru1` (São Paulo)**, alinhada ao Supabase em `sa-east-1`.

## Comandos úteis

```bash
npm run dev                    # localhost:3000
npm run db:migrate             # migrations pendentes
npm run db:migrate-weekday-prices
npm run db:reset-shop          # zera dados operacionais; mantém login e profissionais
npm run create-admin           # dono/barbeiro: -- email senha "Nome"
npm run create-platform-admin  # superadmin: -- email senha "Nome"
npm run lint
npm run typecheck
npm run test
```

## Documentação

- [docs/ARQUITETURA.md](docs/ARQUITETURA.md) — organização, tabelas e permissões
- [docs/api/financeiro.md](docs/api/financeiro.md) — comandas, caixa e comissões
