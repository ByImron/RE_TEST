-- ============================================================
-- ПОЛНАЯ УСТАНОВКА БАЗЫ ОДНИМ ФАЙЛОМ.
--
-- 1) Выполнить этот файл в Supabase SQL Editor (Run).
-- 2) СРАЗУ ГОТОВ ВХОД (никакого создания юзеров вручную):
--        Email:  admin@crm.tj
--        Пароль: Admin12345
--    Войдите на сайт и в Настройках смените пароль.
-- 3) Остальных сотрудников создаёте в самой программе
--    (Настройки -> Сотрудники) или в Supabase -> Authentication.
--
-- Файл генерируется из отдельных миграций; не редактируйте его
-- вручную -- правки делаются в исходных файлах.
-- ============================================================




-- ############################################################
-- ### schema.sql
-- ############################################################

-- RealEstate CRM: objects (properties / construction sites) catalog
-- Everything lives in its own "crm" schema so it never collides with
-- other apps (e.g. ZAKI ERP) sharing this same Supabase project.

create schema if not exists crm;

do $idem$ begin
  create type crm.object_type as enum (
  'apartment',
  'house',
  'commercial',
  'land',
  'construction_site'
);
exception when duplicate_object then null;
end $idem$;

do $idem$ begin
  create type crm.object_status as enum (
  'available',
  'reserved',
  'sold',
  'rented',
  'in_progress'
);
exception when duplicate_object then null;
end $idem$;

create table if not exists crm.objects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  type crm.object_type not null default 'apartment',
  status crm.object_status not null default 'available',
  area numeric,
  price numeric,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists objects_type_idx on crm.objects (type);
create index if not exists objects_status_idx on crm.objects (status);

alter table crm.objects enable row level security;

-- Permissive policy for initial development; tighten once auth/roles are added.
drop policy if exists "Allow all access to objects" on crm.objects;
create policy "Allow all access to objects" on crm.objects
  for all using (true) with check (true);

create or replace function crm.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists objects_set_updated_at on crm.objects;
create trigger objects_set_updated_at
  before update on crm.objects
  for each row execute function crm.set_updated_at();

-- PostgREST needs the anon/authenticated roles granted on this schema,
-- and "crm" added to Project Settings -> API -> Exposed schemas.
grant usage on schema crm to anon, authenticated;
grant all on all tables in schema crm to anon, authenticated;
grant all on all sequences in schema crm to anon, authenticated;
alter default privileges in schema crm grant all on tables to anon, authenticated;
alter default privileges in schema crm grant all on sequences to anon, authenticated;

-- ############################################################
-- ### 002_crm_modules.sql
-- ############################################################

-- RealEstate CRM: clients/leads, tasks, contracts, buildings + apartment matrix
-- Run this AFTER schema.sql, in the same "crm" schema.

-- ===== Clients / leads =====

do $idem$ begin
  create type crm.lead_status as enum (
  'new',
  'contacted',
  'negotiation',
  'client',
  'lost'
);
exception when duplicate_object then null;
end $idem$;

create table if not exists crm.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  source text,
  status crm.lead_status not null default 'new',
  interested_object_id uuid references crm.objects(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists clients_status_idx on crm.clients (status);

alter table crm.clients enable row level security;
drop policy if exists "Allow all access to clients" on crm.clients;
create policy "Allow all access to clients" on crm.clients
  for all using (true) with check (true);

drop trigger if exists clients_set_updated_at on crm.clients;
create trigger clients_set_updated_at
  before update on crm.clients
  for each row execute function crm.set_updated_at();

-- ===== Tasks =====

do $idem$ begin
  create type crm.task_status as enum (
  'todo',
  'in_progress',
  'done'
);
exception when duplicate_object then null;
end $idem$;

create table if not exists crm.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  due_date date,
  status crm.task_status not null default 'todo',
  assignee text,
  client_id uuid references crm.clients(id) on delete set null,
  object_id uuid references crm.objects(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tasks_status_idx on crm.tasks (status);

alter table crm.tasks enable row level security;
drop policy if exists "Allow all access to tasks" on crm.tasks;
create policy "Allow all access to tasks" on crm.tasks
  for all using (true) with check (true);

drop trigger if exists tasks_set_updated_at on crm.tasks;
create trigger tasks_set_updated_at
  before update on crm.tasks
  for each row execute function crm.set_updated_at();

-- ===== Contracts =====

do $idem$ begin
  create type crm.contract_status as enum (
  'draft',
  'active',
  'completed',
  'cancelled'
);
exception when duplicate_object then null;
end $idem$;

create table if not exists crm.contracts (
  id uuid primary key default gen_random_uuid(),
  number text,
  client_id uuid not null references crm.clients(id) on delete restrict,
  object_id uuid not null references crm.objects(id) on delete restrict,
  amount numeric not null default 0,
  paid_amount numeric not null default 0,
  status crm.contract_status not null default 'draft',
  signed_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists contracts_status_idx on crm.contracts (status);
create index if not exists contracts_client_idx on crm.contracts (client_id);
create index if not exists contracts_object_idx on crm.contracts (object_id);

alter table crm.contracts enable row level security;
drop policy if exists "Allow all access to contracts" on crm.contracts;
create policy "Allow all access to contracts" on crm.contracts
  for all using (true) with check (true);

drop trigger if exists contracts_set_updated_at on crm.contracts;
create trigger contracts_set_updated_at
  before update on crm.contracts
  for each row execute function crm.set_updated_at();

-- ===== Buildings + apartment matrix (shakhmatka) =====

create table if not exists crm.buildings (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  floors_count integer,
  units_per_floor integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table crm.buildings enable row level security;
drop policy if exists "Allow all access to buildings" on crm.buildings;
create policy "Allow all access to buildings" on crm.buildings
  for all using (true) with check (true);

drop trigger if exists buildings_set_updated_at on crm.buildings;
create trigger buildings_set_updated_at
  before update on crm.buildings
  for each row execute function crm.set_updated_at();

alter table crm.objects add column if not exists building_id uuid references crm.buildings(id) on delete set null;
alter table crm.objects add column if not exists floor integer;
alter table crm.objects add column if not exists position_in_floor integer;

create index if not exists objects_building_idx on crm.objects (building_id);

-- ===== Grants (redundant safety net alongside default privileges from schema.sql) =====

grant usage on schema crm to anon, authenticated;
grant all on all tables in schema crm to anon, authenticated;
grant all on all sequences in schema crm to anon, authenticated;

-- ############################################################
-- ### 003_settings_media_payments.sql
-- ############################################################

-- RealEstate CRM: app settings, building/unit media, flexible pricing,
-- and contract payment schedule (installments / barter / SMS reminders)

-- ===== Settings (singleton row) =====

create table if not exists crm.settings (
  id boolean primary key default true,
  usd_rate numeric not null default 10.5,
  sms_api_key text,
  sms_sender_name text,
  sms_reminder_days integer not null default 3,
  updated_at timestamptz not null default now(),
  constraint settings_singleton check (id)
);

insert into crm.settings (id) values (true) on conflict (id) do nothing;

alter table crm.settings enable row level security;
drop policy if exists "Allow all access to settings" on crm.settings;
create policy "Allow all access to settings" on crm.settings
  for all using (true) with check (true);

drop trigger if exists settings_set_updated_at on crm.settings;
create trigger settings_set_updated_at
  before update on crm.settings
  for each row execute function crm.set_updated_at();

-- ===== Building/unit media + flexible pricing =====

alter table crm.buildings add column if not exists price_per_sqm numeric;
alter table crm.buildings add column if not exists facade_url text;
alter table crm.buildings add column if not exists plan_url text;
alter table crm.buildings add column if not exists construction_status text not null default 'in_progress';
alter table crm.buildings drop constraint if exists buildings_construction_status_check;
alter table crm.buildings add constraint buildings_construction_status_check
  check (construction_status in ('planning', 'in_progress', 'completed'));

alter table crm.objects add column if not exists plan_url text;

-- Storage bucket for facade photos / building plans / unit plans
insert into storage.buckets (id, name, public)
values ('crm-media', 'crm-media', true)
on conflict (id) do nothing;

drop policy if exists "Public read crm-media" on storage.objects;
create policy "Public read crm-media" on storage.objects
  for select using (bucket_id = 'crm-media');
drop policy if exists "Public upload crm-media" on storage.objects;
create policy "Public upload crm-media" on storage.objects
  for insert with check (bucket_id = 'crm-media');
drop policy if exists "Public update crm-media" on storage.objects;
create policy "Public update crm-media" on storage.objects
  for update using (bucket_id = 'crm-media');
drop policy if exists "Public delete crm-media" on storage.objects;
create policy "Public delete crm-media" on storage.objects
  for delete using (bucket_id = 'crm-media');

-- ===== Contract payment type + installment schedule =====

do $idem$ begin
  create type crm.payment_type as enum ('full', 'installment', 'barter');
exception when duplicate_object then null;
end $idem$;

alter table crm.contracts add column if not exists payment_type crm.payment_type not null default 'full';
alter table crm.contracts add column if not exists installment_months integer;
alter table crm.contracts add column if not exists barter_details text;

create table if not exists crm.contract_payments (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references crm.contracts(id) on delete cascade,
  due_date date not null,
  amount numeric not null,
  paid boolean not null default false,
  paid_date date,
  reminder_sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists contract_payments_contract_idx on crm.contract_payments (contract_id);
create index if not exists contract_payments_due_date_idx on crm.contract_payments (due_date);

alter table crm.contract_payments enable row level security;
drop policy if exists "Allow all access to contract_payments" on crm.contract_payments;
create policy "Allow all access to contract_payments" on crm.contract_payments
  for all using (true) with check (true);

-- ===== Grants (redundant safety net alongside default privileges from schema.sql) =====

grant usage on schema crm to anon, authenticated;
grant all on all tables in schema crm to anon, authenticated;
grant all on all sequences in schema crm to anon, authenticated;

-- ############################################################
-- ### 004_span_and_settings_cleanup.sql
-- ############################################################

-- RealEstate CRM: support merged units in the shakhmatka grid,
-- and stop defaulting SMS sender name to an unrelated placeholder.

alter table crm.objects add column if not exists span integer not null default 1;

alter table crm.settings alter column sms_sender_name drop default;

-- ############################################################
-- ### 005_auth_rls.sql
-- ############################################################

-- RealEstate CRM: require a logged-in Supabase Auth user for all data access.
-- Run this ONLY after you've created at least one user in
-- Supabase Dashboard -> Authentication -> Users -> Add user,
-- since anonymous access to every table below is removed.

drop policy if exists "Allow all access to objects" on crm.objects;
drop policy if exists "Authenticated access to objects" on crm.objects;
create policy "Authenticated access to objects" on crm.objects
  for all to authenticated using (true) with check (true);

drop policy if exists "Allow all access to clients" on crm.clients;
drop policy if exists "Authenticated access to clients" on crm.clients;
create policy "Authenticated access to clients" on crm.clients
  for all to authenticated using (true) with check (true);

drop policy if exists "Allow all access to tasks" on crm.tasks;
drop policy if exists "Authenticated access to tasks" on crm.tasks;
create policy "Authenticated access to tasks" on crm.tasks
  for all to authenticated using (true) with check (true);

drop policy if exists "Allow all access to contracts" on crm.contracts;
drop policy if exists "Authenticated access to contracts" on crm.contracts;
create policy "Authenticated access to contracts" on crm.contracts
  for all to authenticated using (true) with check (true);

drop policy if exists "Allow all access to buildings" on crm.buildings;
drop policy if exists "Authenticated access to buildings" on crm.buildings;
create policy "Authenticated access to buildings" on crm.buildings
  for all to authenticated using (true) with check (true);

drop policy if exists "Allow all access to settings" on crm.settings;
drop policy if exists "Authenticated access to settings" on crm.settings;
create policy "Authenticated access to settings" on crm.settings
  for all to authenticated using (true) with check (true);

drop policy if exists "Allow all access to contract_payments" on crm.contract_payments;
drop policy if exists "Authenticated access to contract_payments" on crm.contract_payments;
create policy "Authenticated access to contract_payments" on crm.contract_payments
  for all to authenticated using (true) with check (true);

-- Storage stays public-read (facade photos/plans are non-sensitive marketing
-- images), but only logged-in users may upload/modify/delete.
drop policy if exists "Public upload crm-media" on storage.objects;
drop policy if exists "Authenticated upload crm-media" on storage.objects;
create policy "Authenticated upload crm-media" on storage.objects
  for insert to authenticated with check (bucket_id = 'crm-media');

drop policy if exists "Public update crm-media" on storage.objects;
drop policy if exists "Authenticated update crm-media" on storage.objects;
create policy "Authenticated update crm-media" on storage.objects
  for update to authenticated using (bucket_id = 'crm-media');

drop policy if exists "Public delete crm-media" on storage.objects;
drop policy if exists "Authenticated delete crm-media" on storage.objects;
create policy "Authenticated delete crm-media" on storage.objects
  for delete to authenticated using (bucket_id = 'crm-media');

-- ############################################################
-- ### 006_task_reminders.sql
-- ############################################################

-- RealEstate CRM: optional SMS reminders for task due dates

alter table crm.tasks add column if not exists assignee_phone text;
alter table crm.tasks add column if not exists reminder_sent_at timestamptz;

-- ############################################################
-- ### 007_currency_template_types.sql
-- ############################################################

-- RealEstate CRM: per-deal currency (no auto-conversion), editable contract
-- template + company info, and non-apartment unit types (parking/commercial).

-- ===== Currency per object / per contract =====

do $idem$ begin
  create type crm.currency as enum ('TJS', 'USD');
exception when duplicate_object then null;
end $idem$;

alter table crm.objects add column if not exists currency crm.currency not null default 'TJS';
alter table crm.contracts add column if not exists currency crm.currency not null default 'TJS';
alter table crm.contracts add column if not exists amount_words text;

-- ===== Client passport (needed by the sample contract text) =====

alter table crm.clients add column if not exists passport text;

-- ===== Non-apartment unit types for the shakhmatka (basement/parking, etc.) =====

alter type crm.object_type add value if not exists 'parking';

-- ===== Company info + editable contract template =====

alter table crm.settings add column if not exists company_name text;
alter table crm.settings add column if not exists company_director text;
alter table crm.settings add column if not exists company_address text;
alter table crm.settings add column if not exists company_bank_details text;
alter table crm.settings add column if not exists contract_template text;

-- The signing-city stamp and the dispute-jurisdiction clause on printed
-- contracts (ContractDocument.tsx) used to hardcode "Бохтар" -- this is
-- resold to different companies in different cities, so it has to be
-- admin-configurable per install instead of baked into the template.
alter table crm.settings add column if not exists company_city text;

-- ############################################################
-- ### 008_default_contract_template.sql
-- ############################################################

-- Seed a default contract template (editable afterwards via Settings).
-- Based on the sample cooperation/purchase agreement provided by the user,
-- with the deal-specific parts replaced by {{placeholders}}.

update crm.settings
set contract_template = $tpl$ШАРТНОМАИ ҲАМКОРИ №{{contract_number}}

{{signed_date}}                                                    {{company_address}}

Тарафҳои аҳдкунанда
Ҷамъияти дорои масъулияти маҳдуди «{{company_name}}» дар шахсияти роҳбари ҷамъият {{company_director}}, ки дар асоси Оинномаи ҷамъият амал мекунад, аз як тараф, минбаъд «Фурӯшанда» ва аз тарафи дигар шаҳрванди Ҷумҳурии Тоҷикистон {{client_name}}, шиноснома {{client_passport}}, ки минбаъд «Харидор» номида мешавад, ҳамин шартномаро бо шартҳои зерин бастанд.

Мақсади шартнома
Бо мақсади вусъат бахшидани рафти сохтмони иншооти воқеъ дар {{building_address}}, тарафҳо уҳдадор шуданд, ки бо шартҳои манфиати мутақобила ҳамкорӣ намоянд.
«Фурӯшанда» имконият медиҳад, ки «Харидор» дар маблағгузории иншооти мазкур ширкат намуда, барои ба моликияти худ ба расмият даровардани {{object_name}}, бо масоҳати {{object_area}} м², ки маблағи фурӯш барои 1 м² — {{price_per_sqm}} {{currency}} мебошад, пардохт намояд. «Харидор» уҳдадор мешавад, ки маблағи умумии объектро — {{amount}} {{currency}} ({{amount_words}}) — пардохт намуда, дар муҳлати пешбининамудаи шартномаи мазкур онро минбаъд ба моликияти шахсии худ табдил дода, иҷро намояд.
«Фурӯшанда» бо анҷом расидани корҳои сохтмонӣ ва супоридани иншоот ба «Харидор» масоҳати зикршударо месупорад.
«Харидор» аз лаҳзаи бастани шартномаи ҳамкорӣ талаботи дар боло нишондодашударо таъмин менамояд.

Уҳдадориҳои тарафҳо
«Фурӯшанда» уҳдадор мешавад ба «Харидор» барои ба расмият даровардани манзил ба моликияти шахсӣ шиносномаи техникӣ диҳад, ки он баъди қабули иншоот ба баҳрабардорӣ дода мешавад.
Тамоми хароҷоти вобаста ба ҳуҷҷатгузории нотариалӣ ва бақайдгирии давлатӣ мустақилона аз ҷониби «Харидор» пардохт карда мешавад.

Масъулияти тарафҳо
«Харидор» барои саривақт пардохт намудани маблағи шартнома масъул мебошад.
«Фурӯшанда» барои саривақт ва босифат иҷро намудани корҳои сохтмонӣ масъул мебошад.

Чораҳои ҷаримавӣ
Дар мавриди риоя накардани муҳлати пардохт зиёда аз як моҳ ба андозаи 0,1% аз маблағи умумии шартнома барои ҳар як рӯзи ба таъхирандозӣ, на зиёда аз 10%, «Харидор» ба «Фурӯшанда» ҷарима пардохт менамояд.

Ҳолатҳои бекор намудани шартнома
Шартнома тибқи мувофиқаи тарафайн то пардохт намудан ва ё бо тартиби яктарафа дар мавриди қобилияти имконнопазир рад намуда, метавон бекор кард.
Дар сурати 2 (ду) моҳ пардохт накардани маблағ аз тарафи «Харидор», «Фурӯшанда» метавонад дигар муштариро барои объекти мазкур аз нав бандад.

Форс-мажор
Ягон тараф масъулиятро барои иҷро накардан ё иҷрои номатлуби уҳдадориҳои худ нахоҳад бурд, агар он дар натиҷаи ҳолатҳои фавқулода (сӯхтор, обхезӣ, заминҷунбӣ ва дигар офатҳои табиӣ) ба вуҷуд омада бошад.

Ҳалли баҳсҳо
Баҳсҳои зимни амалисозии шартномаи мазкур рухдиҳанда бо роҳи гуфтушунид ҳал мешаванд. Дар сурати нагардидани ҳал, баҳс дар асоси қонунҳои амалкунандаи Ҷумҳурии Тоҷикистон дар суди дахлдор ҳаллу фасл карда мешавад.
Шартномаи мазкур аз лаҳзаи ба имзо расонидани ҳар ду тараф эътибор пайдо менамояд ва дар ду нусха бо забони тоҷикӣ барои ҳар кадоме аз тарафҳо тартиб дода шудааст.

Суроғаи ҳуқуқӣ ва имзои тарафҳо:

«Фурӯшанда»                                                    «Харидор»
{{company_director}}                                           {{client_name}}
Суроға: {{company_address}}                             Шиноснома: {{client_passport}}
{{company_bank_details}}

Имзо ___________________                              Имзо ___________________
Санаи {{signed_date}}                                          Санаи {{signed_date}}$tpl$
where contract_template is null;

-- ############################################################
-- ### 009_logo_and_sms_templates.sql
-- ############################################################

-- RealEstate CRM: company logo, block/entrance support for shakhmatka,
-- and editable SMS templates.

alter table crm.settings add column if not exists company_logo_url text;
alter table crm.settings add column if not exists sms_payment_template text;
alter table crm.settings add column if not exists sms_task_template text;
-- Company-wide dashboard hero look (admin-set; users may still override
-- locally). See migration 033.
alter table crm.settings add column if not exists hero_theme text;
alter table crm.settings add column if not exists hero_pattern text;

alter table crm.objects add column if not exists block text;

update crm.settings
set sms_payment_template = $tpl$Уважаемый(ая) {{client_name}}, напоминаем: оплата {{amount}} {{currency}} по договору №{{contract_number}} до {{due_date}}.$tpl$
where sms_payment_template is null;

update crm.settings
set sms_task_template = $tpl${{assignee}}, напоминаем: задача "{{title}}" — срок {{due_date}}.$tpl$
where sms_task_template is null;

-- ############################################################
-- ### 010_cascade_delete_units.sql
-- ############################################################

-- Deleting a building currently orphans its units (building_id set to null),
-- which then show up as stray rows in the top-level Объекты list. Fix so
-- deleting a building removes all of its units in one transaction.

alter table crm.objects
  drop constraint if exists objects_building_id_fkey;

alter table crm.objects
  add constraint objects_building_id_fkey
  foreign key (building_id) references crm.buildings(id) on delete cascade;

-- ############################################################
-- ### 011_roles_and_client_fields.sql
-- ############################################################

-- Roles: admins have full edit rights everywhere; managers can book available
-- units and create new contracts, but cannot edit units/contracts that have
-- already moved past "available" — that's an admin-only action from here on.
--
-- Role assignment is manual and intentional: there is no in-app user
-- management UI. After creating a user in Supabase Dashboard -> Authentication,
-- run this in the SQL Editor (as postgres, which bypasses RLS) to set them up:
--
--   insert into crm.profiles (id, role)
--   values ('<user-id-from-auth-users>', 'admin')
--   on conflict (id) do update set role = excluded.role;
--
-- Use 'manager' instead of 'admin' for regular sales staff. Find a user's id
-- under Authentication -> Users in the dashboard.

create table if not exists crm.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'manager' check (role in ('admin', 'manager')),
  created_at timestamptz not null default now()
);

alter table crm.profiles enable row level security;

drop policy if exists "profiles_select_own" on crm.profiles;
create policy "profiles_select_own" on crm.profiles
  for select to authenticated
  using (id = auth.uid());

-- No insert/update/delete policy for the authenticated role on purpose:
-- role changes only happen via direct SQL (as postgres), which bypasses RLS.
-- This means no logged-in user, including managers, can ever grant
-- themselves admin through the app.

create or replace function crm.is_admin()
returns boolean
language sql
security definer
set search_path = crm, public
stable
as $$
  select coalesce(
    (select role from crm.profiles where id = auth.uid()) = 'admin',
    false
  );
$$;

-- Objects: managers may only update a unit while it's still "available"
-- (i.e. the booking flow, which flips it to "reserved"). Once a unit has
-- moved past that, only an admin can edit it further.
drop policy if exists "Authenticated access to objects" on crm.objects;

drop policy if exists "objects_select" on crm.objects;
create policy "objects_select" on crm.objects
  for select to authenticated using (true);

drop policy if exists "objects_insert" on crm.objects;
create policy "objects_insert" on crm.objects
  for insert to authenticated with check (true);

drop policy if exists "objects_update" on crm.objects;
create policy "objects_update" on crm.objects
  for update to authenticated
  using (status = 'available' or crm.is_admin())
  with check (true);

drop policy if exists "objects_delete" on crm.objects;
create policy "objects_delete" on crm.objects
  for delete to authenticated using (true);

-- Contracts: anyone can create one (booking/sale), but editing or deleting
-- an existing contract is admin-only.
drop policy if exists "Authenticated access to contracts" on crm.contracts;

drop policy if exists "contracts_select" on crm.contracts;
create policy "contracts_select" on crm.contracts
  for select to authenticated using (true);

drop policy if exists "contracts_insert" on crm.contracts;
create policy "contracts_insert" on crm.contracts
  for insert to authenticated with check (true);

drop policy if exists "contracts_update" on crm.contracts;
create policy "contracts_update" on crm.contracts
  for update to authenticated
  using (crm.is_admin())
  with check (true);

drop policy if exists "contracts_delete" on crm.contracts;
create policy "contracts_delete" on crm.contracts
  for delete to authenticated using (crm.is_admin());

-- Client details needed on the printed contract and for the booking-form
-- autocomplete (name -> full profile).
alter table crm.clients add column if not exists birth_date date;
alter table crm.clients add column if not exists address text;
alter table crm.clients add column if not exists passport_issued_by text;

-- ############################################################
-- ### 012_unit_rooms.sql
-- ############################################################

-- Track room count per unit (needed for the block/entrance/room-type
-- constructor: "3 однокомнатных по 45 м², 2 двухкомнатных по 65 м²").
alter table crm.objects add column if not exists rooms smallint;

-- ############################################################
-- ### 013_buildings_admin_rls.sql
-- ############################################################

-- The "Настроить здание" edit page is admin-gated in the UI, but the
-- underlying RLS still let any authenticated user (including managers) call
-- the Supabase API directly to edit or delete a building. Lock that down to
-- match the app-level gate: managers can still create buildings (that's the
-- "+ Новое здание / ЖК" flow in Объекты), but editing/deleting an existing
-- one is admin-only, same as contracts.
drop policy if exists "Authenticated access to buildings" on crm.buildings;

drop policy if exists "buildings_select" on crm.buildings;
create policy "buildings_select" on crm.buildings
  for select to authenticated using (true);

drop policy if exists "buildings_insert" on crm.buildings;
create policy "buildings_insert" on crm.buildings
  for insert to authenticated with check (true);

drop policy if exists "buildings_update" on crm.buildings;
create policy "buildings_update" on crm.buildings
  for update to authenticated
  using (crm.is_admin())
  with check (true);

drop policy if exists "buildings_delete" on crm.buildings;
create policy "buildings_delete" on crm.buildings
  for delete to authenticated using (crm.is_admin());

-- ############################################################
-- ### 020_apply_all_pending.sql
-- ############################################################

-- ============================================================
-- ОДИН ФАЙЛ ВМЕСТО 014–019: безопасно выполняет всё, что нужно
-- приложению на стороне базы. Можно запускать сколько угодно раз
-- (create or replace / drop if exists / if not exists everywhere).
-- Если какие-то из 014–019 уже применялись — ничего не сломает.
-- ============================================================

-- ---------- 014: запись платежа (менеджерам, атомарно) ----------
create or replace function crm.record_payment(
  p_contract_id uuid,
  p_amount numeric,
  p_date date
)
returns crm.contract_payments
language plpgsql
security definer
set search_path = crm, public
as $$
declare
  v_payment crm.contract_payments;
begin
  insert into crm.contract_payments (contract_id, due_date, amount, paid, paid_date)
  values (p_contract_id, p_date, p_amount, true, p_date)
  returning * into v_payment;

  update crm.contracts
  set paid_amount = paid_amount + p_amount
  where id = p_contract_id;

  return v_payment;
end;
$$;

grant execute on function crm.record_payment(uuid, numeric, date) to authenticated;

-- ---------- 015/016: автоматический статус квартиры ----------
create or replace function crm.set_payment_paid(
  p_payment_id uuid,
  p_paid boolean
)
returns crm.contract_payments
language plpgsql
security definer
set search_path = crm, public
as $$
declare
  v_payment crm.contract_payments;
  v_delta numeric;
begin
  select * into v_payment from crm.contract_payments where id = p_payment_id;
  if not found or v_payment.paid = p_paid then
    return v_payment;
  end if;
  v_delta := case when p_paid then v_payment.amount else -v_payment.amount end;

  update crm.contract_payments
  set paid = p_paid, paid_date = case when p_paid then current_date else null end
  where id = p_payment_id
  returning * into v_payment;

  update crm.contracts
  set paid_amount = paid_amount + v_delta
  where id = v_payment.contract_id;

  return v_payment;
end;
$$;

grant execute on function crm.set_payment_paid(uuid, boolean) to authenticated;

create or replace function crm.recompute_object_status(p_object_id uuid)
returns void
language sql
security definer
set search_path = crm, public
as $$
  update crm.objects
  set status = case
    when exists (
      select 1 from crm.contracts c
      where c.object_id = p_object_id and c.status <> 'cancelled' and c.paid_amount > 0
    ) then 'sold'
    when exists (
      select 1 from crm.contracts c
      where c.object_id = p_object_id and c.status <> 'cancelled'
    ) then 'reserved'
    else 'available'
  end::crm.object_status
  where id = p_object_id;
$$;

create or replace function crm.sync_object_status()
returns trigger
language plpgsql
security definer
set search_path = crm, public
as $$
begin
  perform crm.recompute_object_status(coalesce(NEW.object_id, OLD.object_id));
  if TG_OP = 'UPDATE' and OLD.object_id is distinct from NEW.object_id then
    perform crm.recompute_object_status(OLD.object_id);
  end if;
  return coalesce(NEW, OLD);
end;
$$;

drop trigger if exists trg_sync_object_status on crm.contracts;
create trigger trg_sync_object_status
after insert or update or delete on crm.contracts
for each row execute function crm.sync_object_status();

create or replace function crm.resync_all_object_statuses()
returns integer
language plpgsql
security definer
set search_path = crm, public
as $$
declare
  v_count integer := 0;
begin
  update crm.objects o
  set status = case
    when exists (
      select 1 from crm.contracts c
      where c.object_id = o.id and c.status <> 'cancelled' and c.paid_amount > 0
    ) then 'sold'
    when exists (
      select 1 from crm.contracts c
      where c.object_id = o.id and c.status <> 'cancelled'
    ) then 'reserved'
    else 'available'
  end::crm.object_status
  where exists (select 1 from crm.contracts c where c.object_id = o.id);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function crm.resync_all_object_statuses() to authenticated;

-- ---------- 017: удаления только админам + журнал удалений ----------
create table if not exists crm.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid not null,
  details jsonb,
  created_at timestamptz not null default now()
);

alter table crm.audit_log enable row level security;

drop policy if exists "audit_log_select_admin" on crm.audit_log;
create policy "audit_log_select_admin" on crm.audit_log
  for select to authenticated using (crm.is_admin());

create or replace function crm.log_delete()
returns trigger
language plpgsql
security definer
set search_path = crm, public
as $$
begin
  insert into crm.audit_log (actor_id, action, entity_type, entity_id, details)
  values (auth.uid(), 'delete', TG_ARGV[0], OLD.id, to_jsonb(OLD));
  return OLD;
end;
$$;

drop trigger if exists trg_audit_delete_clients on crm.clients;
create trigger trg_audit_delete_clients
before delete on crm.clients
for each row execute function crm.log_delete('client');

drop trigger if exists trg_audit_delete_contracts on crm.contracts;
create trigger trg_audit_delete_contracts
before delete on crm.contracts
for each row execute function crm.log_delete('contract');

drop trigger if exists trg_audit_delete_contract_payments on crm.contract_payments;
create trigger trg_audit_delete_contract_payments
before delete on crm.contract_payments
for each row execute function crm.log_delete('contract_payment');

drop trigger if exists trg_audit_delete_objects on crm.objects;
create trigger trg_audit_delete_objects
before delete on crm.objects
for each row execute function crm.log_delete('object');

-- Auto-prune: keep only the last 14 days of the journal so it never piles up.
-- See migration 035.
create index if not exists audit_log_created_at_idx on crm.audit_log (created_at);
create or replace function crm.prune_audit_log()
returns trigger
language plpgsql
security definer
set search_path = crm, public
as $$
begin
  delete from crm.audit_log where created_at < now() - interval '14 days';
  return null;
end;
$$;
drop trigger if exists trg_prune_audit_log on crm.audit_log;
create trigger trg_prune_audit_log
after insert on crm.audit_log
for each statement execute function crm.prune_audit_log();

drop policy if exists "Authenticated access to clients" on crm.clients;
drop policy if exists "clients_select" on crm.clients;
drop policy if exists "clients_insert" on crm.clients;
drop policy if exists "clients_update" on crm.clients;
drop policy if exists "clients_delete" on crm.clients;
drop policy if exists "clients_select" on crm.clients;
create policy "clients_select" on crm.clients for select to authenticated using (true);
drop policy if exists "clients_insert" on crm.clients;
create policy "clients_insert" on crm.clients for insert to authenticated with check (true);
drop policy if exists "clients_update" on crm.clients;
create policy "clients_update" on crm.clients for update to authenticated using (true) with check (true);
drop policy if exists "clients_delete" on crm.clients;
create policy "clients_delete" on crm.clients for delete to authenticated using (crm.is_admin());

drop policy if exists "Authenticated access to contract_payments" on crm.contract_payments;
drop policy if exists "contract_payments_select" on crm.contract_payments;
drop policy if exists "contract_payments_insert" on crm.contract_payments;
drop policy if exists "contract_payments_update" on crm.contract_payments;
drop policy if exists "contract_payments_delete" on crm.contract_payments;
drop policy if exists "contract_payments_select" on crm.contract_payments;
create policy "contract_payments_select" on crm.contract_payments for select to authenticated using (true);
drop policy if exists "contract_payments_insert" on crm.contract_payments;
create policy "contract_payments_insert" on crm.contract_payments for insert to authenticated with check (true);
drop policy if exists "contract_payments_update" on crm.contract_payments;
create policy "contract_payments_update" on crm.contract_payments for update to authenticated using (crm.is_admin()) with check (true);
drop policy if exists "contract_payments_delete" on crm.contract_payments;
create policy "contract_payments_delete" on crm.contract_payments for delete to authenticated using (crm.is_admin());

drop policy if exists "objects_delete" on crm.objects;
create policy "objects_delete" on crm.objects for delete to authenticated using (crm.is_admin());

-- ---------- 018: отмена быстрой брони, атомарное удаление платежа,
--                 защита от двойного бронирования ----------
create or replace function crm.cancel_quick_booking(p_contract_id uuid)
returns void
language plpgsql
security definer
set search_path = crm, public
as $$
declare
  v_ok boolean;
begin
  select (cl.source = 'quick_booking' and c.paid_amount = 0)
  into v_ok
  from crm.contracts c
  join crm.clients cl on cl.id = c.client_id
  where c.id = p_contract_id;

  if not coalesce(v_ok, false) then
    raise exception 'Not an undoable quick booking';
  end if;

  delete from crm.contracts where id = p_contract_id;
end;
$$;

grant execute on function crm.cancel_quick_booking(uuid) to authenticated;

create or replace function crm.delete_payment(p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = crm, public
as $$
declare
  v_payment crm.contract_payments;
begin
  if not crm.is_admin() then
    raise exception 'Only an admin can delete a payment';
  end if;

  select * into v_payment from crm.contract_payments where id = p_payment_id;
  if not found then
    return;
  end if;

  delete from crm.contract_payments where id = p_payment_id;

  if v_payment.paid then
    update crm.contracts
    set paid_amount = greatest(paid_amount - v_payment.amount, 0)
    where id = v_payment.contract_id;
  end if;
end;
$$;

grant execute on function crm.delete_payment(uuid) to authenticated;

create unique index if not exists uq_contracts_object_active
  on crm.contracts (object_id)
  where status <> 'cancelled';

-- ---------- 019: настройки только админам + лимиты файлов ----------
update storage.buckets
set file_size_limit = 10485760,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']
where id = 'crm-media';

drop policy if exists "Allow all access to settings" on crm.settings;
drop policy if exists "Authenticated access to settings" on crm.settings;
drop policy if exists "settings_select" on crm.settings;
drop policy if exists "settings_update" on crm.settings;

drop policy if exists "settings_select" on crm.settings;
create policy "settings_select" on crm.settings
  for select to authenticated using (true);

drop policy if exists "settings_update" on crm.settings;
create policy "settings_update" on crm.settings
  for update to authenticated using (crm.is_admin()) with check (crm.is_admin());

-- ---------- финальная синхронизация статусов ----------
select crm.resync_all_object_statuses();

-- ############################################################
-- ### 021_roles_scoping_manual_reserve_audit.sql
-- ############################################################

-- ============================================================
-- 021: три вещи.
-- 1) Бронь правой кнопкой БЕЗ клиента: флаг objects.manual_reserved
--    вместо договора-заглушки с подставным клиентом.
-- 2) Роли: manager видит только назначенные ему ЖК; новая роль
--    director — видит всё, менять ничего не может.
-- 3) Журнал событий: фиксирует создание и изменение (не только
--    удаление) договоров, платежей и клиентов.
-- Файл идемпотентный — можно запускать повторно.
-- ============================================================

-- ---------- роли ----------
alter table crm.profiles drop constraint if exists profiles_role_check;
-- ('procurement' -- блок 074: без него повторный запуск файла упал бы на
-- уже назначенном снабженце, ведь ограничение перепроверяет все строки.)
alter table crm.profiles
  add constraint profiles_role_check
  check (role in ('admin', 'manager', 'director', 'accountant', 'procurement'));

create or replace function crm.my_role()
returns text
language sql
security definer
set search_path = crm, public
stable
as $$
  select coalesce((select role from crm.profiles where id = auth.uid()), 'manager');
$$;

create or replace function crm.is_director()
returns boolean
language sql
security definer
set search_path = crm, public
stable
as $$
  select crm.my_role() = 'director';
$$;

-- Директор — только чтение; писать могут админ и менеджер.
create or replace function crm.can_write()
returns boolean
language sql
security definer
set search_path = crm, public
stable
as $$
  select crm.my_role() in ('admin', 'manager');
$$;

-- ---------- назначение ЖК менеджерам ----------
create table if not exists crm.manager_buildings (
  user_id uuid not null references auth.users(id) on delete cascade,
  building_id uuid not null references crm.buildings(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, building_id)
);

alter table crm.manager_buildings enable row level security;

drop policy if exists "manager_buildings_select" on crm.manager_buildings;
create policy "manager_buildings_select" on crm.manager_buildings
  for select to authenticated using (crm.is_admin() or user_id = auth.uid());

drop policy if exists "manager_buildings_insert" on crm.manager_buildings;
create policy "manager_buildings_insert" on crm.manager_buildings
  for insert to authenticated with check (crm.is_admin());

drop policy if exists "manager_buildings_delete" on crm.manager_buildings;
create policy "manager_buildings_delete" on crm.manager_buildings
  for delete to authenticated using (crm.is_admin());

-- Админ и директор видят все ЖК; менеджер — только назначенные.
create or replace function crm.can_view_building(p_building_id uuid)
returns boolean
language sql
security definer
set search_path = crm, public
stable
as $$
  select case
    when crm.my_role() in ('admin', 'director') then true
    else exists (
      select 1 from crm.manager_buildings mb
      where mb.user_id = auth.uid() and mb.building_id = p_building_id
    )
  end;
$$;

-- ---------- видимость по ролям (RLS) ----------
drop policy if exists "Authenticated access to buildings" on crm.buildings;
drop policy if exists "buildings_select" on crm.buildings;
drop policy if exists "buildings_insert" on crm.buildings;
drop policy if exists "buildings_update" on crm.buildings;
drop policy if exists "buildings_delete" on crm.buildings;
drop policy if exists "buildings_select" on crm.buildings;
create policy "buildings_select" on crm.buildings
  for select to authenticated using (crm.can_view_building(id));
drop policy if exists "buildings_insert" on crm.buildings;
create policy "buildings_insert" on crm.buildings
  for insert to authenticated with check (crm.is_admin());
drop policy if exists "buildings_update" on crm.buildings;
create policy "buildings_update" on crm.buildings
  for update to authenticated using (crm.is_admin()) with check (crm.is_admin());
drop policy if exists "buildings_delete" on crm.buildings;
create policy "buildings_delete" on crm.buildings
  for delete to authenticated using (crm.is_admin());

drop policy if exists "Authenticated access to objects" on crm.objects;
drop policy if exists "objects_select" on crm.objects;
drop policy if exists "objects_insert" on crm.objects;
drop policy if exists "objects_update" on crm.objects;
drop policy if exists "objects_delete" on crm.objects;
drop policy if exists "objects_select" on crm.objects;
create policy "objects_select" on crm.objects
  for select to authenticated
  using (building_id is null or crm.can_view_building(building_id));
-- Objects are admin-only for create/edit (managers/directors can still view
-- and book them; the reservation RPC and contract triggers set status, not a
-- direct object write). See migration 032.
drop policy if exists "objects_insert" on crm.objects;
create policy "objects_insert" on crm.objects
  for insert to authenticated
  with check (
    crm.is_admin() and (building_id is null or crm.can_view_building(building_id))
  );
drop policy if exists "objects_update" on crm.objects;
create policy "objects_update" on crm.objects
  for update to authenticated
  using (
    crm.is_admin()
    and (building_id is null or crm.can_view_building(building_id))
  )
  with check (crm.is_admin());
drop policy if exists "objects_delete" on crm.objects;
create policy "objects_delete" on crm.objects
  for delete to authenticated using (crm.is_admin());

drop policy if exists "Authenticated access to contracts" on crm.contracts;
drop policy if exists "contracts_select" on crm.contracts;
drop policy if exists "contracts_insert" on crm.contracts;
drop policy if exists "contracts_update" on crm.contracts;
drop policy if exists "contracts_delete" on crm.contracts;
drop policy if exists "contracts_select" on crm.contracts;
create policy "contracts_select" on crm.contracts
  for select to authenticated
  using (
    exists (
      select 1 from crm.objects o
      where o.id = object_id
        and (o.building_id is null or crm.can_view_building(o.building_id))
    )
  );
drop policy if exists "contracts_insert" on crm.contracts;
create policy "contracts_insert" on crm.contracts
  for insert to authenticated
  with check (
    crm.can_write()
    and exists (
      select 1 from crm.objects o
      where o.id = object_id
        and (o.building_id is null or crm.can_view_building(o.building_id))
    )
  );
drop policy if exists "contracts_update" on crm.contracts;
create policy "contracts_update" on crm.contracts
  for update to authenticated using (crm.is_admin()) with check (crm.is_admin());
drop policy if exists "contracts_delete" on crm.contracts;
create policy "contracts_delete" on crm.contracts
  for delete to authenticated using (crm.is_admin());

drop policy if exists "Authenticated access to contract_payments" on crm.contract_payments;
drop policy if exists "contract_payments_select" on crm.contract_payments;
drop policy if exists "contract_payments_insert" on crm.contract_payments;
drop policy if exists "contract_payments_update" on crm.contract_payments;
drop policy if exists "contract_payments_delete" on crm.contract_payments;
drop policy if exists "contract_payments_select" on crm.contract_payments;
create policy "contract_payments_select" on crm.contract_payments
  for select to authenticated
  using (
    exists (
      select 1
      from crm.contracts c
      join crm.objects o on o.id = c.object_id
      where c.id = contract_id
        and (o.building_id is null or crm.can_view_building(o.building_id))
    )
  );
drop policy if exists "contract_payments_insert" on crm.contract_payments;
create policy "contract_payments_insert" on crm.contract_payments
  for insert to authenticated
  with check (
    crm.can_write()
    and exists (
      select 1
      from crm.contracts c
      join crm.objects o on o.id = c.object_id
      where c.id = contract_id
        and (o.building_id is null or crm.can_view_building(o.building_id))
    )
  );
drop policy if exists "contract_payments_update" on crm.contract_payments;
create policy "contract_payments_update" on crm.contract_payments
  for update to authenticated using (crm.is_admin()) with check (crm.is_admin());
drop policy if exists "contract_payments_delete" on crm.contract_payments;
create policy "contract_payments_delete" on crm.contract_payments
  for delete to authenticated using (crm.is_admin());

drop policy if exists "Authenticated access to clients" on crm.clients;
drop policy if exists "clients_select" on crm.clients;
drop policy if exists "clients_insert" on crm.clients;
drop policy if exists "clients_update" on crm.clients;
drop policy if exists "clients_delete" on crm.clients;
drop policy if exists "clients_select" on crm.clients;
create policy "clients_select" on crm.clients
  for select to authenticated using (true);
drop policy if exists "clients_insert" on crm.clients;
create policy "clients_insert" on crm.clients
  for insert to authenticated with check (crm.can_write());
drop policy if exists "clients_update" on crm.clients;
create policy "clients_update" on crm.clients
  for update to authenticated using (crm.can_write()) with check (crm.can_write());
drop policy if exists "clients_delete" on crm.clients;
create policy "clients_delete" on crm.clients
  for delete to authenticated using (crm.is_admin());

-- ---------- бронь без клиента ----------
alter table crm.objects add column if not exists manual_reserved boolean not null default false;

-- Статус теперь учитывает и ручную бронь (без договора).
create or replace function crm.recompute_object_status(p_object_id uuid)
returns void
language sql
security definer
set search_path = crm, public
as $$
  update crm.objects o
  set status = case
    when exists (
      select 1 from crm.contracts c
      where c.object_id = o.id and c.status <> 'cancelled' and c.paid_amount > 0
    ) then 'sold'
    when exists (
      select 1 from crm.contracts c
      where c.object_id = o.id and c.status <> 'cancelled'
    ) then 'reserved'
    when o.manual_reserved then 'reserved'
    else 'available'
  end::crm.object_status
  where o.id = p_object_id;
$$;

create or replace function crm.sync_object_status()
returns trigger
language plpgsql
security definer
set search_path = crm, public
as $$
begin
  -- A real contract supersedes a hand-set reservation: once the deal is
  -- drafted, the unit's fate follows the contract, and cancelling that
  -- contract must free the unit rather than fall back to a stale flag.
  if TG_OP = 'INSERT' then
    update crm.objects set manual_reserved = false
    where id = NEW.object_id and manual_reserved;
  end if;

  perform crm.recompute_object_status(coalesce(NEW.object_id, OLD.object_id));
  if TG_OP = 'UPDATE' and OLD.object_id is distinct from NEW.object_id then
    perform crm.recompute_object_status(OLD.object_id);
  end if;
  return coalesce(NEW, OLD);
end;
$$;

drop trigger if exists trg_sync_object_status on crm.contracts;
create trigger trg_sync_object_status
after insert or update or delete on crm.contracts
for each row execute function crm.sync_object_status();

create or replace function crm.resync_all_object_statuses()
returns integer
language plpgsql
security definer
set search_path = crm, public
as $$
declare
  v_count integer := 0;
begin
  update crm.objects o
  set status = case
    when exists (
      select 1 from crm.contracts c
      where c.object_id = o.id and c.status <> 'cancelled' and c.paid_amount > 0
    ) then 'sold'
    when exists (
      select 1 from crm.contracts c
      where c.object_id = o.id and c.status <> 'cancelled'
    ) then 'reserved'
    when o.manual_reserved then 'reserved'
    else 'available'
  end::crm.object_status
  where o.manual_reserved
     or exists (select 1 from crm.contracts c where c.object_id = o.id);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function crm.resync_all_object_statuses() to authenticated;

-- ПКМ по свободной квартире ставит бронь, повторный ПКМ снимает.
-- Никакого клиента и договора не создаётся.
create or replace function crm.toggle_manual_reservation(p_object_id uuid)
returns boolean
language plpgsql
security definer
set search_path = crm, public
as $$
declare
  v_building uuid;
  v_new boolean;
begin
  if not crm.can_write() then
    raise exception 'Read-only role';
  end if;

  select building_id into v_building from crm.objects where id = p_object_id;
  if not found then
    raise exception 'Object not found';
  end if;
  if v_building is not null and not crm.can_view_building(v_building) then
    raise exception 'Building not allowed for this user';
  end if;

  -- A unit whose state is driven by a live contract can't be hand-toggled.
  if exists (
    select 1 from crm.contracts c
    where c.object_id = p_object_id and c.status <> 'cancelled'
  ) then
    raise exception 'Unit is managed by a contract';
  end if;

  update crm.objects
  set manual_reserved = not manual_reserved
  where id = p_object_id
  returning manual_reserved into v_new;

  perform crm.recompute_object_status(p_object_id);
  return v_new;
end;
$$;

grant execute on function crm.toggle_manual_reservation(uuid) to authenticated;

-- ---------- директор: только чтение и в обход RPC ----------
create or replace function crm.record_payment(
  p_contract_id uuid,
  p_amount numeric,
  p_date date
)
returns crm.contract_payments
language plpgsql
security definer
set search_path = crm, public
as $$
declare
  v_payment crm.contract_payments;
begin
  if not crm.can_write() then
    raise exception 'Read-only role';
  end if;
  if not exists (
    select 1
    from crm.contracts c
    join crm.objects o on o.id = c.object_id
    where c.id = p_contract_id
      and (o.building_id is null or crm.can_view_building(o.building_id))
  ) then
    raise exception 'Contract not allowed for this user';
  end if;

  insert into crm.contract_payments (contract_id, due_date, amount, paid, paid_date)
  values (p_contract_id, p_date, p_amount, true, p_date)
  returning * into v_payment;

  update crm.contracts
  set paid_amount = paid_amount + p_amount
  where id = p_contract_id;

  return v_payment;
end;
$$;

create or replace function crm.set_payment_paid(
  p_payment_id uuid,
  p_paid boolean
)
returns crm.contract_payments
language plpgsql
security definer
set search_path = crm, public
as $$
declare
  v_payment crm.contract_payments;
  v_delta numeric;
begin
  if not crm.can_write() then
    raise exception 'Read-only role';
  end if;

  select * into v_payment from crm.contract_payments where id = p_payment_id;
  if not found or v_payment.paid = p_paid then
    return v_payment;
  end if;
  v_delta := case when p_paid then v_payment.amount else -v_payment.amount end;

  update crm.contract_payments
  set paid = p_paid, paid_date = case when p_paid then current_date else null end
  where id = p_payment_id
  returning * into v_payment;

  update crm.contracts
  set paid_amount = paid_amount + v_delta
  where id = v_payment.contract_id;

  return v_payment;
end;
$$;

create or replace function crm.cancel_quick_booking(p_contract_id uuid)
returns void
language plpgsql
security definer
set search_path = crm, public
as $$
declare
  v_ok boolean;
begin
  if not crm.can_write() then
    raise exception 'Read-only role';
  end if;

  select (cl.source = 'quick_booking' and c.paid_amount = 0)
  into v_ok
  from crm.contracts c
  join crm.clients cl on cl.id = c.client_id
  where c.id = p_contract_id;

  if not coalesce(v_ok, false) then
    raise exception 'Not an undoable quick booking';
  end if;

  delete from crm.contracts where id = p_contract_id;
end;
$$;

-- ---------- журнал: создание и изменение, не только удаление ----------
create or replace function crm.log_change()
returns trigger
language plpgsql
security definer
set search_path = crm, public
as $$
declare
  v_diff jsonb;
begin
  if TG_OP = 'INSERT' then
    insert into crm.audit_log (actor_id, action, entity_type, entity_id, details)
    values (auth.uid(), 'create', TG_ARGV[0], NEW.id, to_jsonb(NEW));
    return NEW;
  end if;

  -- UPDATE: only the fields that actually changed, old -> new, so the log
  -- reads as "what happened" instead of two full row dumps.
  select coalesce(
    jsonb_object_agg(n.key, jsonb_build_object('old', o.value, 'new', n.value)),
    '{}'::jsonb
  )
  into v_diff
  from jsonb_each(to_jsonb(NEW)) n
  join jsonb_each(to_jsonb(OLD)) o using (key)
  where n.value is distinct from o.value
    and n.key not in ('updated_at');

  if v_diff <> '{}'::jsonb then
    insert into crm.audit_log (actor_id, action, entity_type, entity_id, details)
    values (auth.uid(), 'update', TG_ARGV[0], NEW.id, v_diff);
  end if;
  return NEW;
end;
$$;

-- Более ранний вариант этого файла ставил триггеры с другими именами;
-- убираем их, иначе оба набора сработают и журнал задвоится.
drop trigger if exists trg_log_change_contracts on crm.contracts;
drop trigger if exists trg_log_change_contract_payments on crm.contract_payments;
drop trigger if exists trg_log_change_clients on crm.clients;

drop trigger if exists trg_audit_change_contracts on crm.contracts;
create trigger trg_audit_change_contracts
after insert or update on crm.contracts
for each row execute function crm.log_change('contract');

drop trigger if exists trg_audit_change_contract_payments on crm.contract_payments;
create trigger trg_audit_change_contract_payments
after insert or update on crm.contract_payments
for each row execute function crm.log_change('contract_payment');

drop trigger if exists trg_audit_change_clients on crm.clients;
create trigger trg_audit_change_clients
after insert or update on crm.clients
for each row execute function crm.log_change('client');

-- ---------- пересборка графика рассрочки из остатка ----------
create or replace function crm.regenerate_schedule(
  p_contract_id uuid,
  p_months integer
)
returns integer
language plpgsql
security definer
set search_path = crm, public
as $$
declare
  v_contract crm.contracts;
  v_remaining numeric;
  v_base numeric;
  v_amount numeric;
  i integer;
begin
  if not crm.can_write() then
    raise exception 'Read-only role';
  end if;
  if p_months is null or p_months < 1 then
    raise exception 'Months must be at least 1';
  end if;

  select * into v_contract from crm.contracts where id = p_contract_id;
  if not found then
    raise exception 'Contract not found';
  end if;

  v_remaining := greatest(v_contract.amount - v_contract.paid_amount, 0);
  if v_remaining <= 0 then
    raise exception 'Nothing left to schedule';
  end if;

  -- Только план; фактические (оплаченные) строки неприкосновенны.
  delete from crm.contract_payments
  where contract_id = p_contract_id and paid = false;

  v_base := floor(v_remaining / p_months * 100) / 100;
  for i in 1..p_months loop
    if i = p_months then
      v_amount := round((v_remaining - v_base * (p_months - 1)) * 100) / 100;
    else
      v_amount := v_base;
    end if;
    insert into crm.contract_payments (contract_id, due_date, amount, paid, paid_date)
    values (p_contract_id, (current_date + (i || ' month')::interval)::date, v_amount, false, null);
  end loop;

  update crm.contracts
  set installment_months = p_months, payment_type = 'installment'
  where id = p_contract_id;

  return p_months;
end;
$$;

grant execute on function crm.regenerate_schedule(uuid, integer) to authenticated;

-- Пересозданные выше функции наследуют старые grant-ы, но если 020 в этой
-- базе так и не выполнился, их никто не выдавал — проставим явно.
grant execute on function crm.record_payment(uuid, numeric, date) to authenticated;
grant execute on function crm.set_payment_paid(uuid, boolean) to authenticated;
grant execute on function crm.cancel_quick_booking(uuid) to authenticated;

-- финальная синхронизация статусов
select crm.resync_all_object_statuses();

-- ############################################################
-- ### 022_lock_out_strangers.sql
-- ############################################################

-- ============================================================
-- 022: посторонний с аккаунтом = никто.
--
-- Дыра: crm.my_role() возвращал 'manager' для любого вошедшего
-- пользователя БЕЗ строки в crm.profiles. Если в Supabase включена
-- самостоятельная регистрация (по умолчанию включена), чужак мог
-- зарегистрироваться напрямую через API и сразу получить права
-- менеджера: видеть всех клиентов и писать в базу.
--
-- Исправление: нет строки в profiles — роль 'none', то есть ничего
-- не видно и ничего нельзя. Роль выдаёт только админ (страница
-- «Сотрудники» создаёт profiles через service-ключ).
--
-- ВАЖНО: дополнительно отключите самостоятельную регистрацию в
-- Supabase Dashboard → Authentication → Sign In / Providers →
-- "Allow new users to sign up" → OFF. Аккаунты создаёт только админ.
--
-- Файл идемпотентный — можно запускать повторно.
-- ============================================================

create or replace function crm.my_role()
returns text
language sql
security definer
set search_path = crm, public
stable
as $$
  select coalesce((select role from crm.profiles where id = auth.uid()), 'none');
$$;

-- Есть ли у пользователя вообще какая-то роль в системе.
create or replace function crm.has_role()
returns boolean
language sql
security definer
set search_path = crm, public
stable
as $$
  select crm.my_role() in ('admin', 'manager', 'director');
$$;

-- Клиенты: раньше select был using(true) — любой аутентифицированный
-- видел всю клиентскую базу. Теперь только сотрудники.
drop policy if exists "clients_select" on crm.clients;
create policy "clients_select" on crm.clients
  for select to authenticated using (crm.has_role());

-- Квартиры/договоры/платежи: политики уже завязаны на can_view_building,
-- но ветка "building_id is null" была видна всем аутентифицированным.
-- Добавляем общий ролевой замок.
drop policy if exists "objects_select" on crm.objects;
create policy "objects_select" on crm.objects
  for select to authenticated
  using (
    crm.has_role() and (building_id is null or crm.can_view_building(building_id))
  );

drop policy if exists "contracts_select" on crm.contracts;
create policy "contracts_select" on crm.contracts
  for select to authenticated
  using (
    crm.has_role()
    and exists (
      select 1 from crm.objects o
      where o.id = object_id
        and (o.building_id is null or crm.can_view_building(o.building_id))
    )
  );

drop policy if exists "contract_payments_select" on crm.contract_payments;
create policy "contract_payments_select" on crm.contract_payments
  for select to authenticated
  using (
    crm.has_role()
    and exists (
      select 1
      from crm.contracts c
      join crm.objects o on o.id = c.object_id
      where c.id = contract_id
        and (o.building_id is null or crm.can_view_building(o.building_id))
    )
  );

-- Задачи и настройки: были открыты любому аутентифицированному.
drop policy if exists "Authenticated access to tasks" on crm.tasks;
drop policy if exists "tasks_all" on crm.tasks;
create policy "tasks_all" on crm.tasks
  for all to authenticated using (crm.has_role()) with check (crm.can_write());

drop policy if exists "settings_select" on crm.settings;
create policy "settings_select" on crm.settings
  for select to authenticated using (crm.has_role());

-- ############################################################
-- ### 023_delete_client_cascade.sql
-- ############################################################

-- ============================================================
-- 023: каскадное удаление клиента админом.
--
-- Обычное удаление клиента заблокировано, если у него есть договоры
-- (и это правильно). Этот RPC — осознанное действие админа: удаляет
-- клиента ВМЕСТЕ со всеми его договорами и платежами, одной
-- транзакцией. Роль проверяется здесь, в базе, а не в браузере.
--
-- Каждая удалённая строка попадает в журнал событий (audit_log)
-- через существующие триггеры log_delete, так что «что именно
-- удалили» восстановимо из журнала. Статусы квартир пересчитаются
-- сами: триггер на удаление договора уже это делает.
--
-- Файл идемпотентный — можно запускать повторно.
-- ============================================================

create or replace function crm.delete_client_cascade(p_client_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = crm, public
as $$
declare
  v_contracts integer := 0;
  v_payments integer := 0;
begin
  if not crm.is_admin() then
    raise exception 'Только администратор может удалять клиентов';
  end if;

  delete from crm.contract_payments cp
  using crm.contracts c
  where cp.contract_id = c.id and c.client_id = p_client_id;
  get diagnostics v_payments = row_count;

  delete from crm.contracts where client_id = p_client_id;
  get diagnostics v_contracts = row_count;

  delete from crm.clients where id = p_client_id;

  return jsonb_build_object('contracts', v_contracts, 'payments', v_payments);
end;
$$;

grant execute on function crm.delete_client_cascade(uuid) to authenticated;

-- ############################################################
-- ### 024_performance_indexes.sql
-- ############################################################

-- ============================================================
-- 024: индексы под реальные запросы приложения.
--
-- Все списки в приложении уже пагинированы (по 25 строк), но без
-- индексов Postgres всё равно перебирает таблицы целиком при каждом
-- фильтре. Эти индексы покрывают ровно те запросы, которые страницы
-- делают постоянно:
--   контракты по клиенту (карточка клиента, колонка долга в списке),
--   контракты по квартире (шахматка),
--   платежи по договору (графики, расиды),
--   квартиры по зданию (шахматка),
--   журнал по дате (страница журнала),
--   клиенты по дате создания (список клиентов).
--
-- Файл идемпотентный — можно запускать повторно.
-- ============================================================

create index if not exists idx_contracts_client_id on crm.contracts (client_id);
create index if not exists idx_contracts_object_id on crm.contracts (object_id);
create index if not exists idx_contract_payments_contract_id
  on crm.contract_payments (contract_id);
create index if not exists idx_objects_building_id on crm.objects (building_id);
create index if not exists idx_audit_log_created_at
  on crm.audit_log (created_at desc);
create index if not exists idx_clients_created_at on crm.clients (created_at desc);
-- Поиск клиентов по имени/телефону идёт через ilike '%…%' -- обычный
-- btree тут не помогает, нужен триграммный.
create extension if not exists pg_trgm;
create index if not exists idx_clients_name_trgm
  on crm.clients using gin (name gin_trgm_ops);
create index if not exists idx_clients_phone_trgm
  on crm.clients using gin (phone gin_trgm_ops);

-- ############################################################
-- ### 025_validate_payment_amounts.sql
-- ############################################################

-- ============================================================
-- 025: платёж не может быть нулевым или отрицательным.
--
-- record_payment принимал любую сумму: отрицательный «платёж» тихо
-- уменьшал paid_amount договора — касса и график разошлись бы, а в
-- истории лежала бы строка с минусом. Теперь база отвергает такие
-- вызовы независимо от того, что прислал интерфейс.
--
-- Файл идемпотентный — можно запускать повторно.
-- ============================================================

create or replace function crm.record_payment(
  p_contract_id uuid,
  p_amount numeric,
  p_date date
)
returns crm.contract_payments
language plpgsql
security definer
set search_path = crm, public
as $$
declare
  v_payment crm.contract_payments;
begin
  if not crm.can_write() then
    raise exception 'Read-only role';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Сумма платежа должна быть больше нуля';
  end if;
  if p_date is null then
    raise exception 'Не указана дата платежа';
  end if;
  if not exists (
    select 1
    from crm.contracts c
    join crm.objects o on o.id = c.object_id
    where c.id = p_contract_id
      and (o.building_id is null or crm.can_view_building(o.building_id))
  ) then
    raise exception 'Contract not allowed for this user';
  end if;

  insert into crm.contract_payments (contract_id, due_date, amount, paid, paid_date)
  values (p_contract_id, p_date, p_amount, true, p_date)
  returning * into v_payment;

  update crm.contracts
  set paid_amount = paid_amount + p_amount
  where id = p_contract_id;

  return v_payment;
end;
$$;

grant execute on function crm.record_payment(uuid, numeric, date) to authenticated;

-- Страховка на уровне таблицы: строка платежа с суммой <= 0 не может
-- появиться вообще, каким бы путём её ни вставляли.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'chk_contract_payments_amount_positive'
  ) then
    -- not valid: не проверяет старые строки (вдруг там уже есть мусор --
    -- его чинят руками), но блокирует любые новые.
    alter table crm.contract_payments
      add constraint chk_contract_payments_amount_positive
      check (amount > 0) not valid;
  end if;
end $$;

-- ############################################################
-- ### 026_public_branding.sql
-- ############################################################

-- ============================================================
-- 026: название и логотип компании для страницы входа.
--
-- Настройки целиком (реквизиты, шаблоны SMS) читают только сотрудники
-- (022), но страница входа показывается ДО входа — ей нужно название
-- и логотип. Эта функция отдаёт только эти два поля и ничего больше,
-- поэтому её можно открыть анонимным без риска.
--
-- Файл идемпотентный — можно запускать повторно.
-- ============================================================

-- Returns the company hero theme/pattern too, so the pre-auth login page can
-- paint itself in the company theme. See migration 034. DROP first because the
-- return type changed (name+logo -> +theme+pattern).
drop function if exists crm.public_branding();

create or replace function crm.public_branding()
returns table (company_name text, company_logo_url text, hero_theme text, hero_pattern text)
language sql
security definer
set search_path = crm, public
stable
as $$
  select s.company_name, s.company_logo_url, s.hero_theme, s.hero_pattern
  from crm.settings s
  limit 1;
$$;

grant execute on function crm.public_branding() to anon, authenticated;

-- ############################################################
-- ### 027_first_user_is_admin.sql
-- ############################################################

-- ============================================================
-- 027: первый пользователь автоматически становится админом.
--
-- Раньше после создания базы приходилось вручную выполнять SQL,
-- чтобы выдать первому аккаунту роль admin (курица и яйцо: админов
-- ещё нет, а роли выдаёт админ). Теперь: если в системе ещё НЕТ ни
-- одного админа, первый созданный пользователь получает роль admin
-- сам. Все последующие пользователи роли НЕ получают — их создаёт
-- админ со страницы «Сотрудники».
--
-- Безопасность: правило срабатывает только пока админов ноль, то
-- есть ровно один раз за жизнь базы. Но самостоятельную регистрацию
-- всё равно нужно держать выключенной (Authentication → Sign In /
-- Providers → Allow new users to sign up → OFF) — это правило
-- «первый = админ» и открытая регистрация вместе означали бы гонку
-- за первое место.
--
-- Файл идемпотентный — можно запускать повторно.
-- ============================================================

create or replace function crm.grant_admin_to_first_user()
returns trigger
language plpgsql
security definer
set search_path = crm, public
as $$
begin
  if not exists (select 1 from crm.profiles where role = 'admin') then
    insert into crm.profiles (id, role)
    values (new.id, 'admin')
    on conflict (id) do update set role = 'admin';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_first_user_is_admin on auth.users;
create trigger trg_first_user_is_admin
after insert on auth.users
for each row execute function crm.grant_admin_to_first_user();

-- Если база уже существует и в ней ровно один пользователь без роли
-- (типичная картина свежей установки) — сделать его админом сейчас.
do $$
declare
  v_only_user uuid;
begin
  if not exists (select 1 from crm.profiles where role = 'admin') then
    select id into v_only_user from auth.users
    order by created_at asc limit 1;
    if v_only_user is not null then
      insert into crm.profiles (id, role)
      values (v_only_user, 'admin')
      on conflict (id) do update set role = 'admin';
    end if;
  end if;
end $$;

-- ############################################################
-- ### 028_staff_management_no_service_key.sql
-- ############################################################

-- ============================================================
-- 028: управление сотрудниками БЕЗ service-ключа.
--
-- Раньше страница «Сотрудники» ходила в серверный API с секретным
-- ключом (SUPABASE_SERVICE_ROLE_KEY). Любая ошибка этого ключа на
-- Vercel ломала всю страницу целиком — нельзя было даже увидеть
-- список.
--
-- Теперь список пользователей и выдача ролей работают через обычные
-- RPC прямо в базе (SECURITY DEFINER, доступ только админу). Никакого
-- секретного ключа не нужно — всё как с остальными данными
-- программы. Новый порядок:
--   1) админ создаёт пользователя в Supabase → Authentication → Users;
--   2) он сам появляется в списке на странице «Сотрудники»;
--   3) админ ставит ему роль и объекты прямо в программе.
--
-- Файл идемпотентный — можно запускать повторно.
-- ============================================================

-- Возвращаемый тип этой функции менялся (блок 070 добавил уровни доступа), а
-- create or replace не умеет менять тип -- поэтому перед каждым созданием она
-- удаляется, иначе повторный запуск файла падал бы.
drop function if exists crm.list_staff();

-- Список всех пользователей с их ролью (роль 'none' — если ещё не
-- назначена). Только для админа. Функция выполняется от владельца БД,
-- поэтому может читать auth.users, недоступную обычному ключу.
create or replace function crm.list_staff()
returns table (id uuid, email text, role text, created_at timestamptz)
language plpgsql
security definer
set search_path = crm, public
stable
as $$
begin
  if not crm.is_admin() then
    raise exception 'Только администратор может видеть список сотрудников';
  end if;
  return query
    select u.id,
           u.email::text,
           coalesce(p.role, 'none') as role,
           u.created_at
    from auth.users u
    left join crm.profiles p on p.id = u.id
    order by u.created_at asc;
end;
$$;

grant execute on function crm.list_staff() to authenticated;

-- Выдать/сменить роль. 'none' = убрать доступ (удалить строку роли).
-- Только для админа. Себя понизить нельзя — иначе можно случайно
-- остаться без единого админа.
create or replace function crm.set_user_role(p_user uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = crm, public
as $$
begin
  if not crm.is_admin() then
    raise exception 'Только администратор может менять роли';
  end if;
  if p_role not in ('admin', 'manager', 'director', 'none') then
    raise exception 'Неизвестная роль: %', p_role;
  end if;
  if p_user = auth.uid() and p_role <> 'admin' then
    raise exception 'Нельзя снять роль администратора с самого себя';
  end if;

  if p_role = 'none' then
    delete from crm.profiles where id = p_user;
  else
    insert into crm.profiles (id, role)
    values (p_user, p_role)
    on conflict (id) do update set role = excluded.role;
  end if;
end;
$$;

grant execute on function crm.set_user_role(uuid, text) to authenticated;

-- ############################################################
-- ### 029_seed_admin.sql
-- ############################################################

-- ============================================================
-- 029: готовый аккаунт администратора прямо из SQL.
--
-- Больше НИКАКОЙ возни с созданием пользователей в дашборде,
-- подтверждением почты и "не тот проект". Выполнили этот файл —
-- сразу есть рабочий вход:
--
--     Email:  admin@crm.tj
--     Пароль: Admin12345
--
-- ПОСЛЕ ПЕРВОГО ВХОДА ОБЯЗАТЕЛЬНО СМЕНИТЕ ПАРОЛЬ в программе:
-- Настройки → «Сменить пароль».
--
-- Заодно, если в базе уже есть аккаунт iammirzozoda@gmail.com,
-- который не пускал, — этот файл чинит его: подтверждает почту и
-- делает админом.
--
-- Файл идемпотентный — можно запускать повторно. ВАЖНО (блок 057):
-- пароль задаётся только при первом создании аккаунта. Если аккаунт уже
-- есть, повторный запуск больше НЕ переписывает его пароль обратно на
-- Admin12345 -- раньше переписывал, из-за чего смена пароля в Настройках
-- выглядела так, будто она "не сохраняется": она сохранялась, но
-- следующий же прогон этого файла (а его просят запускать при каждой
-- новой миграции) тихо возвращал старый пароль. Забыли пароль по-настоящему
-- -- меняйте его как у любого пользователя: Supabase → Authentication →
-- Users → выбрать аккаунт → задать новый пароль.
-- ============================================================

-- crypt() / gen_salt() для хеша пароля.
create extension if not exists pgcrypto;

-- Универсальная процедура: создать аккаунт с паролем, если его нет,
-- либо починить существующий (пароль + подтверждение почты), и в любом
-- случае выдать роль admin.
create or replace function crm.ensure_admin(p_email text, p_password text)
returns void
language plpgsql
security definer
-- extensions: там в Supabase живут crypt()/gen_salt() из pgcrypto.
set search_path = auth, crm, public, extensions
as $$
declare
  v_uid uuid;
begin
  select id into v_uid from auth.users where email = p_email;

  if v_uid is null then
    v_uid := gen_random_uuid();
    -- ВАЖНО: служебные token-поля задаём пустой строкой, а не оставляем
    -- NULL. Иначе при входе GoTrue (сервис авторизации Supabase) не может
    -- прочитать строку и падает с "Database error querying schema".
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token,
      email_change_token_new, email_change, email_change_token_current,
      phone_change, phone_change_token, reauthentication_token
    ) values (
      '00000000-0000-0000-0000-000000000000', v_uid,
      'authenticated', 'authenticated', p_email,
      crypt(p_password, gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
      '', '', '', '', '', '', '', ''
    );
    insert into auth.identities (
      provider_id, user_id, identity_data, provider, created_at, updated_at
    ) values (
      v_uid::text, v_uid,
      jsonb_build_object('sub', v_uid::text, 'email', p_email),
      'email', now(), now()
    );
  else
    -- Чиним уже созданный аккаунт: подтверждение почты и те же token-поля,
    -- если они остались NULL от прежней SQL-вставки. Пароль здесь
    -- НАМЕРЕННО не трогается (блок 057) -- иначе каждый повторный запуск
    -- этого файла тихо возвращал бы пароль, честно изменённый через
    -- Настройки, обратно на Admin12345.
    update auth.users
       set email_confirmed_at = coalesce(email_confirmed_at, now()),
           confirmation_token = coalesce(confirmation_token, ''),
           recovery_token = coalesce(recovery_token, ''),
           email_change_token_new = coalesce(email_change_token_new, ''),
           email_change = coalesce(email_change, ''),
           email_change_token_current = coalesce(email_change_token_current, ''),
           phone_change = coalesce(phone_change, ''),
           phone_change_token = coalesce(phone_change_token, ''),
           reauthentication_token = coalesce(reauthentication_token, ''),
           updated_at = now()
     where id = v_uid;
    if not exists (
      select 1 from auth.identities where user_id = v_uid and provider = 'email'
    ) then
      insert into auth.identities (
        provider_id, user_id, identity_data, provider, created_at, updated_at
      ) values (
        v_uid::text, v_uid,
        jsonb_build_object('sub', v_uid::text, 'email', p_email),
        'email', now(), now()
      );
    end if;
  end if;

  insert into crm.profiles (id, role)
  values (v_uid, 'admin')
  on conflict (id) do update set role = 'admin';
end;
$$;

-- КРИТИЧНО: функция умеет назначать админа, поэтому её нельзя вызывать
-- никому, кроме самой базы. По умолчанию Postgres разрешает EXECUTE всем
-- (PUBLIC) — иначе любой аноним через API сделал бы себя админом. Отзываем.
revoke all on function crm.ensure_admin(text, text) from public;
revoke all on function crm.ensure_admin(text, text) from anon;
revoke all on function crm.ensure_admin(text, text) from authenticated;

-- Готовый вход "из коробки".
select crm.ensure_admin('admin@crm.tj', 'Admin12345');

-- Чиним/поднимаем ваш личный аккаунт, если он был заведён раньше.
select crm.ensure_admin('iammirzozoda@gmail.com', 'Admin12345');

-- ############################################################
-- ### 030_sales_by_manager.sql
-- ############################################################

-- ============================================================
-- 030: продажи по менеджерам.
--
-- 1) В договоре появляется поле created_by — кто оформил сделку.
--    Заполняется САМО при создании (триггер ставит текущего
--    пользователя), менять ввод в программе не нужно. Старые договоры
--    останутся без менеджера ("Без менеджера" в отчёте).
-- 2) RPC crm.sales_by_manager() — сводка для дашборда: по каждому
--    менеджеру число сделок, сумма договоров и сколько оплачено, в
--    разрезе валют. Только админ и директор.
--
-- Файл идемпотентный — можно запускать повторно.
-- ============================================================

alter table crm.contracts
  add column if not exists created_by uuid references auth.users(id) on delete set null;

-- Проставлять автора при вставке (все пути создания договора идут от
-- имени вошедшего пользователя).
create or replace function crm.set_contract_creator()
returns trigger
language plpgsql
security definer
set search_path = crm, public
as $$
begin
  if new.created_by is null then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_contract_creator on crm.contracts;
create trigger trg_set_contract_creator
before insert on crm.contracts
for each row execute function crm.set_contract_creator();

-- Сводка продаж по менеджерам. Читает auth.users (email), поэтому
-- SECURITY DEFINER и только для админа/директора.
create or replace function crm.sales_by_manager()
returns table (
  manager text,
  currency text,
  contracts bigint,
  total numeric,
  paid numeric
)
language plpgsql
security definer
set search_path = crm, public, auth
stable
as $$
begin
  if not (crm.is_admin() or crm.is_director()) then
    raise exception 'Доступно только администратору и директору';
  end if;
  return query
    select
      coalesce(u.email::text, 'Без менеджера') as manager,
      c.currency::text as currency,
      count(*)::bigint as contracts,
      sum(c.amount) as total,
      sum(least(c.paid_amount, c.amount)) as paid
    from crm.contracts c
    left join auth.users u on u.id = c.created_by
    where c.status <> 'cancelled'
    group by 1, 2
    order by 4 desc nulls last;
end;
$$;

grant execute on function crm.sales_by_manager() to authenticated;

-- ############################################################
-- ### 031_office_type.sql
-- ############################################################

-- ============================================================
-- 031: тип помещения «Офис».
--
-- Для смешанных зданий (1 этаж — магазин, 2 этаж — офисы, выше —
-- квартиры) не хватало отдельного типа «офис». Добавляем в enum.
-- 'parking' добавлен ещё в 007 — здесь на всякий случай тоже с
-- IF NOT EXISTS, если база очень старая.
--
-- Файл идемпотентный.
-- ============================================================

alter type crm.object_type add value if not exists 'office';
alter type crm.object_type add value if not exists 'parking';

-- ############################################################
-- ### 037_sales_by_manager_period.sql
-- ############################################################

-- ============================================================
-- 037: «Продажи по менеджерам» — фильтр по периоду.
--
-- crm.sales_by_manager() пересоздаётся с двумя необязательными
-- параметрами (p_from, p_to по signed_date). При NULL ведёт себя как
-- раньше -- без фильтра, вся история. Старая версия без аргументов
-- удаляется явно: иначе Postgres считает вызов sales_by_manager() без
-- скобочных аргументов неоднозначным (обе сигнатуры подходят, у новой
-- ведь оба параметра со значением по умолчанию).
--
-- Файл идемпотентный -- можно запускать повторно.
-- ============================================================

drop function if exists crm.sales_by_manager();

create or replace function crm.sales_by_manager(p_from date default null, p_to date default null)
returns table (
  manager text,
  currency text,
  contracts bigint,
  total numeric,
  paid numeric
)
language plpgsql
security definer
set search_path = crm, public, auth
stable
as $$
begin
  if not (crm.is_admin() or crm.is_director()) then
    raise exception 'Доступно только администратору и директору';
  end if;
  return query
    select
      coalesce(u.email::text, 'Без менеджера') as manager,
      c.currency::text as currency,
      count(*)::bigint as contracts,
      sum(c.amount) as total,
      sum(least(c.paid_amount, c.amount)) as paid
    from crm.contracts c
    left join auth.users u on u.id = c.created_by
    where c.status <> 'cancelled'
      and (p_from is null or c.signed_date >= p_from)
      and (p_to is null or c.signed_date <= p_to)
    group by 1, 2
    order by 4 desc nulls last;
end;
$$;

grant execute on function crm.sales_by_manager(date, date) to authenticated;

-- ############################################################
-- ### 032_objects_admin_only.sql
-- ############################################################

-- Objects (property units) become admin-only for create and edit, matching
-- buildings. Managers/directors can still SELECT them, book them (contracts +
-- the SECURITY DEFINER reservation RPC set the unit's status, not a direct
-- object write), and record payments -- but they can no longer add, rename,
-- reprice, or restructure a unit. Delete was already admin-only.

drop policy if exists "objects_insert" on crm.objects;
drop policy if exists "objects_update" on crm.objects;

drop policy if exists "objects_insert" on crm.objects;
create policy "objects_insert" on crm.objects
  for insert to authenticated
  with check (
    crm.is_admin() and (building_id is null or crm.can_view_building(building_id))
  );

drop policy if exists "objects_update" on crm.objects;
create policy "objects_update" on crm.objects
  for update to authenticated
  using (
    crm.is_admin()
    and (building_id is null or crm.can_view_building(building_id))
  )
  with check (crm.is_admin());

-- ############################################################
-- ### 033_hero_theme_settings.sql
-- ############################################################

-- Company-wide dashboard hero look. The admin picks a colour theme and an
-- ornament pattern in Settings; it applies for everyone who hasn't set a
-- personal (device-local) override. Nullable text -- null means the built-in
-- default ("atlas" / no pattern). Settings updates are already admin-only.

alter table crm.settings add column if not exists hero_theme text;
alter table crm.settings add column if not exists hero_pattern text;

-- ############################################################
-- ### 034_public_branding_theme.sql
-- ############################################################

-- Expose the company hero theme/pattern through the anon public_branding RPC,
-- so the LOGIN page (pre-auth, no session) can paint itself in the company's
-- chosen theme instead of the default plum. Only these four non-sensitive
-- fields are returned; nothing else from settings.
--
-- DROP first: Postgres refuses to change a function's return type via CREATE
-- OR REPLACE (the old signature returned only name+logo).
drop function if exists crm.public_branding();

create or replace function crm.public_branding()
returns table (
  company_name text,
  company_logo_url text,
  hero_theme text,
  hero_pattern text
)
language sql
security definer
set search_path = crm, public
stable
as $$
  select s.company_name, s.company_logo_url, s.hero_theme, s.hero_pattern
  from crm.settings s
  limit 1;
$$;

grant execute on function crm.public_branding() to anon, authenticated;

-- ############################################################
-- ### 035_prune_audit_log.sql
-- ############################################################

-- Keep the event journal from growing forever. Entries older than 14 days are
-- pruned automatically, triggered whenever a new event is logged (statement
-- level, so it runs once per insert, not per row). An index on created_at
-- keeps both the prune and the newest-first listing fast.
create index if not exists audit_log_created_at_idx on crm.audit_log (created_at);

create or replace function crm.prune_audit_log()
returns trigger
language plpgsql
security definer
set search_path = crm, public
as $$
begin
  delete from crm.audit_log where created_at < now() - interval '14 days';
  return null;
end;
$$;

drop trigger if exists trg_prune_audit_log on crm.audit_log;
create trigger trg_prune_audit_log
after insert on crm.audit_log
for each statement execute function crm.prune_audit_log();

-- ############################################################
-- ### 036_building_construction_status.sql
-- ############################################################

-- Construction-stage tracking for a building/ЖК: planning (нет ещё продаж),
-- in_progress (стройка идёт, актуально для дашборда), completed (сдан --
-- его данные больше не тянут общую статистику дашборда, а сворачиваются в
-- одну сжатую строку). Idempotent: safe to run on a database that already
-- has this column.
alter table crm.buildings
  add column if not exists construction_status text not null default 'in_progress';

alter table crm.buildings
  drop constraint if exists buildings_construction_status_check;

alter table crm.buildings
  add constraint buildings_construction_status_check
  check (construction_status in ('planning', 'in_progress', 'completed'));

-- ############################################################
-- ### 038_dashboard_summary.sql
-- ############################################################

-- ============================================================
-- 038: crm.dashboard_summary() — весь дашборд одним запросом,
--      посчитанным в базе.
--
-- ЗАЧЕМ. Дашборд тянул crm.objects, crm.contracts и crm.contract_payments
-- ЦЕЛИКОМ в браузер и складывал суммы в JavaScript. Пока объектов пара
-- сотен, это просто медленно. Но PostgREST по умолчанию отдаёт максимум
-- 1000 строк на запрос -- и как только объектов (или договоров, или
-- платежей) станет больше тысячи, лишние строки молча отбрасываются.
-- Ошибки при этом НЕ будет: площади, выручка, долги и заполняемость
-- просто начнут показывать неправду. Считать надо в SQL -- Postgres
-- агрегирует по индексам и отдаёт десяток чисел вместо десятков тысяч
-- строк.
--
-- БЕЗОПАСНОСТЬ. Функция намеренно SECURITY INVOKER (в отличие от
-- crm.sales_by_manager, которая definer + явная проверка роли). Дашборд
-- открыт всем сотрудникам, а видимость данных у менеджера ограничена
-- назначенными ему ЖК через RLS (crm.can_view_building). SECURITY
-- DEFINER обошёл бы эти политики и показал бы менеджеру цифры по всей
-- компании. С invoker политики применяются как обычно, поэтому функция
-- возвращает ровно тот же срез данных, который пользователь и так мог
-- бы прочитать сам. Пользователю без роли RLS не отдаст ничего -- он
-- увидит нули.
--
-- ПАРАМЕТРЫ.
--   p_building_id — NULL: все ЖК, кроме сданных ('completed'); иначе
--                   только этот ЖК (в том числе если он сдан).
--   p_from/p_to   — отчётный период по дате подписания договора. NULL =
--                   вся история. Период влияет только на «денежные»
--                   цифры (выручка, долг, должники, выручка по ЖК) --
--                   остатки на складе (количества, площади, заполняемость)
--                   и просрочка периодом не режутся, ровно как и раньше
--                   в интерфейсе.
--
-- Файл идемпотентный -- можно запускать повторно.
-- ============================================================

create or replace function crm.dashboard_summary(
  p_building_id uuid default null,
  p_from date default null,
  p_to date default null
)
returns jsonb
language sql
stable
security invoker
set search_path = crm, public
as $$
with
-- Квартиры/помещения в области видимости фильтра. Объект без ЖК
-- (building_id is null) остаётся в общей картине: он ничей, но он есть.
scoped_objects as (
  select o.id, o.status, o.building_id, o.price, o.currency, o.area
  from crm.objects o
  left join crm.buildings b on b.id = o.building_id
  where case
          when p_building_id is not null then o.building_id = p_building_id
          else coalesce(b.construction_status, 'in_progress') <> 'completed'
        end
),
-- Договоры на эти объекты. building_id тащим с собой, чтобы разложить
-- выручку по ЖК без второго join'а.
scoped_contracts as (
  select c.id, c.client_id, c.amount, c.paid_amount, c.currency,
         c.signed_date, c.status, so.building_id
  from crm.contracts c
  join scoped_objects so on so.id = c.object_id
),
-- Действующие договоры внутри отчётного периода: основа всех денежных
-- цифр. Расторгнутые не считаются нигде.
live_contracts as (
  select *
  from scoped_contracts
  where status <> 'cancelled'
    and (p_from is null or (signed_date is not null and signed_date >= p_from))
    and (p_to   is null or (signed_date is not null and signed_date <= p_to))
),
-- ЖК, попадающие в разрезы «заполняемость» и «выручка по ЖК».
rel_buildings as (
  select b.id, b.name
  from crm.buildings b
  where case
          when p_building_id is not null then b.id = p_building_id
          else b.construction_status <> 'completed'
        end
),
obj_stats as (
  select
    (count(*))::int                                             as total,
    (count(*) filter (where status = 'available'))::int         as available,
    (count(*) filter (where status = 'reserved'))::int          as reserved,
    (count(*) filter (where status = 'sold'))::int              as sold,
    (count(*) filter (where status = 'in_progress'))::int       as in_progress,
    coalesce(sum(area), 0)                                    as area_total,
    coalesce(sum(area) filter (where status = 'available'), 0) as area_available,
    -- Потенциал = прайс ещё не проданного.
    coalesce(sum(price) filter (where status = 'available' and currency <> 'USD'), 0) as pot_tjs,
    coalesce(sum(price) filter (where status = 'available' and currency  = 'USD'), 0) as pot_usd
  from scoped_objects
),
money as (
  select
    coalesce(sum(paid_amount) filter (where currency <> 'USD'), 0) as paid_tjs,
    coalesce(sum(paid_amount) filter (where currency  = 'USD'), 0) as paid_usd,
    -- greatest(...,0): переплата по одному договору не должна гасить
    -- долг по другому.
    coalesce(sum(greatest(amount - paid_amount, 0)) filter (where currency <> 'USD'), 0) as debt_tjs,
    coalesce(sum(greatest(amount - paid_amount, 0)) filter (where currency  = 'USD'), 0) as debt_usd
  from live_contracts
),
-- Просрочка: неоплаченные взносы, срок которых уже прошёл. Периодом не
-- режется -- долг просрочен независимо от того, какой период смотрят.
overdue as (
  select
    coalesce(sum(p.amount) filter (where c.currency <> 'USD'), 0) as tjs,
    coalesce(sum(p.amount) filter (where c.currency  = 'USD'), 0) as usd
  from crm.contract_payments p
  join scoped_contracts c on c.id = p.contract_id
  where not p.paid
    and p.due_date < current_date
    and c.status <> 'cancelled'
),
-- График по месяцам: последние 6 месяцев, в которых вообще были
-- подписания. Периодом не режется -- это тренд, а не отчёт.
month_rev as (
  select
    to_char(signed_date, 'YYYY-MM')                            as month,
    coalesce(sum(amount) filter (where currency <> 'USD'), 0)  as tjs,
    coalesce(sum(amount) filter (where currency  = 'USD'), 0)  as usd
  from scoped_contracts
  where status <> 'cancelled' and signed_date is not null
  group by 1
  order by 1 desc
  limit 6
),
-- График по дням: фактически принятые деньги за выбранный период.
-- Считается только когда период задан (в интерфейсе — «сегодня»/«месяц»).
day_rev as (
  select
    p.paid_date                                                 as day,
    coalesce(sum(p.amount) filter (where c.currency <> 'USD'), 0) as tjs,
    coalesce(sum(p.amount) filter (where c.currency  = 'USD'), 0) as usd
  from crm.contract_payments p
  join scoped_contracts c on c.id = p.contract_id
  where p.paid
    and p.paid_date is not null
    and p_from is not null
    and p_to is not null
    and p.paid_date between p_from and p_to
  group by 1
),
occ as (
  select
    rb.id, rb.name,
    (count(*))::int                                          as total,
    (count(*) filter (where so.status = 'available'))::int    as available,
    (count(*) filter (where so.status = 'reserved'))::int     as reserved,
    (count(*) filter (where so.status = 'sold'))::int         as sold,
    (count(*) filter (where so.status = 'rented'))::int       as rented,
    (count(*) filter (where so.status = 'in_progress'))::int  as in_progress
  from rel_buildings rb
  join scoped_objects so on so.building_id = rb.id
  group by rb.id, rb.name
),
bld_rev as (
  select
    rb.id, rb.name,
    coalesce(sum(lc.amount) filter (where lc.currency <> 'USD'), 0) as tjs,
    coalesce(sum(lc.amount) filter (where lc.currency  = 'USD'), 0) as usd
  from rel_buildings rb
  join live_contracts lc on lc.building_id = rb.id
  group by rb.id, rb.name
),
debtors as (
  select
    lc.client_id,
    cl.name,
    lc.currency::text                       as currency,
    sum(lc.amount - lc.paid_amount)         as remaining
  from live_contracts lc
  join crm.clients cl on cl.id = lc.client_id
  where lc.amount - lc.paid_amount > 0
  group by 1, 2, 3
  order by 4 desc
  limit 5
),
-- Сданные ЖК свёрнуты в одну строку «столько-то домов, столько-то
-- квартир» -- их цифры не должны перевешивать текущие продажи.
completed as (
  select
    (select count(*) from crm.buildings where construction_status = 'completed')::int as buildings,
    (select count(*)
       from crm.objects o
       join crm.buildings b on b.id = o.building_id
      where b.construction_status = 'completed')::int as units
)
select jsonb_build_object(
  'counts', (
    select jsonb_build_object(
      'total', total, 'available', available, 'reserved', reserved,
      'sold', sold, 'in_progress', in_progress
    ) from obj_stats
  ),
  'area', (select jsonb_build_object('total', area_total, 'available', area_available) from obj_stats),
  'potential', (select jsonb_build_object('tjs', pot_tjs, 'usd', pot_usd) from obj_stats),
  'paid', (select jsonb_build_object('tjs', paid_tjs, 'usd', paid_usd) from money),
  'debt', (select jsonb_build_object('tjs', debt_tjs, 'usd', debt_usd) from money),
  'overdue', (select jsonb_build_object('tjs', tjs, 'usd', usd) from overdue),
  'revenue_months', coalesce((
    select jsonb_agg(jsonb_build_object('month', month, 'tjs', tjs, 'usd', usd) order by month)
    from month_rev
  ), '[]'::jsonb),
  'revenue_days', coalesce((
    select jsonb_agg(jsonb_build_object('day', day, 'tjs', tjs, 'usd', usd) order by day)
    from day_rev
  ), '[]'::jsonb),
  'occupancy', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', id, 'name', name, 'total', total,
      'available', available, 'reserved', reserved, 'sold', sold,
      'rented', rented, 'in_progress', in_progress
    ) order by name)
    from occ
  ), '[]'::jsonb),
  'revenue_by_building', coalesce((
    select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'tjs', tjs, 'usd', usd)
                     order by (tjs + usd) desc)
    from bld_rev where tjs > 0 or usd > 0
  ), '[]'::jsonb),
  'top_debtors', coalesce((
    select jsonb_agg(jsonb_build_object(
      'client_id', client_id, 'name', name, 'currency', currency, 'remaining', remaining
    ) order by remaining desc)
    from debtors
  ), '[]'::jsonb),
  'completed', (select jsonb_build_object('buildings', buildings, 'units', units) from completed)
);
$$;

grant execute on function crm.dashboard_summary(uuid, date, date) to authenticated;

-- Индексы под ровно эти агрегаты. Без них Postgres читает таблицы
-- целиком на каждое открытие дашборда -- на больших объёмах это ровно та
-- же медленная страница, только медленная уже на сервере.
--
-- Договоры группируются по месяцу подписания и раскладываются по ЖК:
create index if not exists idx_contracts_signed_date on crm.contracts (signed_date);
-- Просрочка ищет неоплаченные взносы с истёкшим сроком, дневная выручка --
-- оплаченные по дате оплаты. Частичные индексы: по каждому флагу идёт
-- ровно один из двух запросов, и оба они узкие.
create index if not exists idx_contract_payments_unpaid_due
  on crm.contract_payments (due_date) where not paid;
create index if not exists idx_contract_payments_paid_date
  on crm.contract_payments (paid_date) where paid;
-- Срез «квартиры этого ЖК с таким-то статусом» (заполняемость, количества):
create index if not exists idx_objects_building_status
  on crm.objects (building_id, status);


-- ============================================================
-- crm.overdue_contracts() — страница «Должники», сгруппированная в базе.
--
-- Та же болезнь, что и у дашборда, только опаснее: страница тянула ВСЕ
-- неоплаченные просроченные взносы и группировала их по договору в
-- браузере. А взносов на один договор бывает 20-30 (рассрочка на два
-- года), то есть тысячный потолок PostgREST упирался уже на нескольких
-- десятках должников -- и список долгов молча становился неполным.
-- Группировка в SQL даёт СТРОКУ НА ДОГОВОР, а не на взнос.
--
-- SECURITY INVOKER — по тем же причинам, что и dashboard_summary:
-- менеджер должен видеть должников только своих ЖК.
-- ============================================================

create or replace function crm.overdue_contracts()
returns table (
  contract_id uuid,
  contract_number text,
  client_id uuid,
  client_name text,
  client_phone text,
  object_name text,
  currency text,
  missed_count int,
  total_overdue numeric,
  earliest_due date,
  latest_due date
)
language sql
stable
security invoker
set search_path = crm, public
as $$
  select
    c.id,
    c.number,
    cl.id,
    coalesce(cl.name, '—'),
    cl.phone,
    o.name,
    c.currency::text,
    (count(*))::int,
    sum(p.amount),
    min(p.due_date),
    max(p.due_date)
  from crm.contract_payments p
  join crm.contracts c on c.id = p.contract_id
  left join crm.clients cl on cl.id = c.client_id
  left join crm.objects  o  on o.id = c.object_id
  where not p.paid
    and p.due_date < current_date
    -- Остатки графика по расторгнутому договору — это не долг.
    and c.status <> 'cancelled'
  group by c.id, c.number, cl.id, cl.name, cl.phone, o.name, c.currency
  -- Самый большой долг сверху: с него и начинают обзвон.
  order by sum(p.amount) desc;
$$;

grant execute on function crm.overdue_contracts() to authenticated;


-- ============================================================
-- crm.building_unit_stats() — сводка по каждому ЖК для списка объектов.
--
-- Страница «Объекты» считала это, вычитывая все квартиры всех ЖК
-- страницами по 1000 в цикле: на 10 000 квартир — десять последовательных
-- запросов подряд только ради трёх чисел на карточку. Один group by
-- отдаёт то же самое одной строкой на ЖК.
-- ============================================================

create or replace function crm.building_unit_stats()
returns table (
  building_id uuid,
  total int,
  available int,
  available_area numeric
)
language sql
stable
security invoker
set search_path = crm, public
as $$
  select
    o.building_id,
    (count(*))::int,
    (count(*) filter (where o.status = 'available'))::int,
    coalesce(sum(o.area) filter (where o.status = 'available'), 0)
  from crm.objects o
  where o.building_id is not null
  group by o.building_id;
$$;

grant execute on function crm.building_unit_stats() to authenticated;

-- ############################################################
-- ### 039_overdue_pagination.sql
-- ############################################################

-- ============================================================
-- 039: пагинация страницы «Должники».
--
-- 038 убрал главный потолок: список стал СТРОКОЙ НА ДОГОВОР вместо
-- строки на каждый просроченный взнос, и это сразу в 20-30 раз меньше
-- строк. Но потолок PostgREST в 1000 строк никуда не делся -- он просто
-- отодвинулся: когда договоров в просрочке станет больше тысячи,
-- список снова начнёт молча обрываться. Поэтому страница переходит на
-- постраничную выдачу, как «Клиенты» и «Объекты».
--
-- Здесь две правки под это:
--
-- 1. crm.overdue_contracts() пересоздаётся с УСТОЙЧИВОЙ сортировкой.
--    Раньше было просто `order by sum(p.amount) desc`. Для одного
--    запроса этого хватало, но для пагинации -- нет: два договора с
--    ОДИНАКОВОЙ суммой долга Postgres может вернуть в любом порядке, и
--    порядок этот может отличаться между запросом первой страницы и
--    запросом второй. На практике это значит, что один должник
--    показался бы на обеих страницах, а другой не показался бы нигде.
--    Добавлен c.id вторым ключом -- он уникален, поэтому порядок
--    становится полным и воспроизводимым.
--
-- 2. crm.overdue_totals() -- итоги по валютам для плашек над таблицей.
--    Их принципиально нельзя сложить из одной страницы: на экране 25
--    договоров из, скажем, 1200, а в шапке должна стоять сумма долга по
--    ВСЕМ. Считается отдельным агрегатом по всей выборке.
--
-- SECURITY INVOKER -- как и всё в 038: видимость должников ограничена
-- назначенными менеджеру ЖК через RLS.
--
-- Файл идемпотентный -- можно запускать повторно.
-- ============================================================

create or replace function crm.overdue_contracts()
returns table (
  contract_id uuid,
  contract_number text,
  client_id uuid,
  client_name text,
  client_phone text,
  object_name text,
  currency text,
  missed_count int,
  total_overdue numeric,
  earliest_due date,
  latest_due date
)
language sql
stable
security invoker
set search_path = crm, public
as $$
  select
    c.id,
    c.number,
    cl.id,
    coalesce(cl.name, '—'),
    cl.phone,
    o.name,
    c.currency::text,
    (count(*))::int,
    sum(p.amount),
    min(p.due_date),
    max(p.due_date)
  from crm.contract_payments p
  join crm.contracts c on c.id = p.contract_id
  left join crm.clients cl on cl.id = c.client_id
  left join crm.objects  o  on o.id = c.object_id
  where not p.paid
    and p.due_date < current_date
    -- Остатки графика по расторгнутому договору — это не долг.
    and c.status <> 'cancelled'
  group by c.id, c.number, cl.id, cl.name, cl.phone, o.name, c.currency
  -- Самый большой долг сверху: с него и начинают обзвон. c.id вторым
  -- ключом -- чтобы порядок был полным и страницы не «плавали».
  order by sum(p.amount) desc, c.id;
$$;

grant execute on function crm.overdue_contracts() to authenticated;


create or replace function crm.overdue_totals()
returns table (
  currency text,
  contracts int,
  total_overdue numeric
)
language sql
stable
security invoker
set search_path = crm, public
as $$
  select
    c.currency::text,
    -- distinct: строк здесь по одной на ВЗНОС, а считаем договоры.
    (count(distinct c.id))::int,
    sum(p.amount)
  from crm.contract_payments p
  join crm.contracts c on c.id = p.contract_id
  where not p.paid
    and p.due_date < current_date
    and c.status <> 'cancelled'
  group by c.currency
  order by sum(p.amount) desc;
$$;

grant execute on function crm.overdue_totals() to authenticated;

-- ############################################################
-- ### 040_sms_scheduler.sql
-- ############################################################

-- ============================================================
-- 040: рабочая SMS-рассылка — выключатель «Старт/Стоп», второе
--      напоминание в день платежа и журнал запусков.
--
-- ЧТО БЫЛО НЕ ТАК. Рассылка молчала по трём причинам сразу:
--
--   1. Оба крон-маршрута отклоняют запрос, если переменная окружения
--      CRON_SECRET не задана (fail closed — иначе платный шлюз мог бы
--      дёрнуть кто угодно из интернета). Vercel подставляет заголовок
--      Authorization: Bearer <CRON_SECRET> только когда эта переменная
--      есть в проекте. Не задана — каждый ночной запуск получал 401 и
--      тихо уходил в никуда. Ошибку никто не видел: в интерфейсе нет
--      ни одного места, где было бы написано, работает рассылка или нет.
--      Это лечится не в базе, а настройкой Vercel + новой страницей
--      состояния (/api/sms/status), которая теперь прямо говорит, чего
--      не хватает.
--
--   2. Не было «выключателя»: рассылка либо шла всегда, либо никогда.
--      sms_enabled — это и есть кнопки Старт/Стоп.
--
--   3. Напоминание было ровно одно на взнос (reminder_sent_at), поэтому
--      «за 3 дня И в день платежа» было технически невозможно —
--      вторая отметка просто негде было хранить.
--
-- ОТДЕЛЬНО ВАЖНО. Старый запрос брал взносы с `due_date <= сегодня+3`,
-- то есть ВСЮ просрочку за всё время. Стоило рассылке заработать — и
-- первым же запуском улетели бы сотни SMS по давно просроченным
-- платежам. Новый код ограничен окном (сегодня; сегодня+N] и «ровно
-- сегодня», прошлое не трогается вовсе.
--
-- Файл идемпотентный -- можно запускать повторно.
-- ============================================================

-- Кнопка Старт/Стоп. По умолчанию ВЫКЛЮЧЕНО: включение — осознанное
-- действие администратора, а не побочный эффект применения миграции.
alter table crm.settings
  add column if not exists sms_enabled boolean not null default false;

-- Чтобы в настройках было видно, что рассылка живая: когда отработала
-- в последний раз и с каким результатом.
alter table crm.settings
  add column if not exists sms_last_run_at timestamptz;

alter table crm.settings
  add column if not exists sms_last_result text;

-- Вторая отметка: напоминание в день платежа. reminder_sent_at остаётся
-- за предварительным (за N дней), так что уже разосланное не повторится.
alter table crm.contract_payments
  add column if not exists due_reminder_sent_at timestamptz;

-- Оба запроса рассылки ищут одинаково: неоплаченные взносы в узком окне
-- дат, у которых соответствующая отметка ещё пустая.
create index if not exists idx_contract_payments_reminder_due
  on crm.contract_payments (due_date)
  where not paid;

-- ############################################################
-- ### 041_client_second_phone.sql
-- ############################################################

-- ============================================================
-- 041: второй номер телефона у клиента.
--
-- У людей регулярно два номера (рабочий и личный, или свой и
-- родственника, который берёт трубку). До сих пор в карточке было одно
-- поле, и второй номер приходилось дописывать в примечания -- откуда его
-- не видно ни в поиске, ни при звонке, ни при отправке SMS.
--
-- Отдельная колонка, а не массив: `phone` используется по всему коду как
-- основной номер (SMS-шлюз, ссылки WhatsApp, поиск, список должников),
-- и превращать его в массив значило бы переписать всё это ради поля,
-- которое почти всегда пустое. phone остаётся основным, phone2 --
-- запасным.
--
-- Файл идемпотентный -- можно запускать повторно.
-- ============================================================

alter table crm.clients
  add column if not exists phone2 text;

-- Поиск клиентов идёт через ilike '%…%' и по второму номеру тоже, значит
-- ему нужен такой же триграммный индекс, как у phone (см. миграцию 024).
create extension if not exists pg_trgm;

create index if not exists idx_clients_phone2_trgm
  on crm.clients using gin (phone2 gin_trgm_ops);

-- ############################################################
-- ### 042_paid_amount_from_payments.sql
-- ############################################################

-- ============================================================
-- 042: остаток долга считается ПО ИСТОРИИ ПЛАТЕЖЕЙ, а не хранится
--      отдельным числом, которое можно перезаписать руками.
--
-- ЧТО БЫЛО НЕ ТАК. contracts.paid_amount — обычная колонка, и её
-- значение поддерживалось вручную из трёх разных мест:
--
--   * crm.record_payment() прибавлял сумму нового платежа,
--   * crm.delete_payment() вычитал сумму удалённого,
--   * форма договора ПРОСТО ЗАПИСЫВАЛА туда то, что стояло в поле
--     «Оплачено» (а его ещё и пересчитывал ползунок процентов).
--
-- Пока договор не трогали, три источника совпадали. Но стоило открыть
-- «Изменить договор» и сохранить — и в paid_amount уезжало значение из
-- формы, никак не связанное с реальными чеками. Строки платежей при
-- этом оставались на месте: история есть, а «Оплачено» и «Остаток» её
-- больше не отражают. Ровно то, на что жалуется пользователь.
--
-- КАК ЧИНИМ. Единственный источник правды — строки crm.contract_payments
-- с paid = true. Триггер пересчитывает paid_amount при любом изменении
-- этих строк, а обе RPC перестают считать сами (иначе к пересчёту
-- добавилась бы ещё и ручная арифметика — и сумма удвоилась бы).
--
-- ПРО СТАРЫЕ ДАННЫЕ. Разовый пересчёт в конце файла НЕ обнуляет деньги.
-- Если у договора paid_amount больше суммы его чеков (так бывает у
-- договоров, заведённых до того, как первоначальный взнос стали
-- записывать отдельной строкой), разница не стирается, а материализуется
-- как настоящий платёж — датой подписания. Только после этого paid_amount
-- пересчитывается по строкам. Терять уже полученные деньги нельзя.
--
-- Файл идемпотентный -- можно запускать повторно.
-- ============================================================

create or replace function crm.sync_contract_paid_amount()
returns trigger
language plpgsql
security definer
set search_path = crm, public
as $$
declare
  v_contract_id uuid;
begin
  -- Именно через tg_op, а не coalesce(new.…, old.…): при DELETE запись new
  -- вообще не назначена, и обращение к её полю — ошибка выполнения, а не
  -- NULL. Удаление платежа падало бы.
  if tg_op = 'DELETE' then
    v_contract_id := old.contract_id;
  else
    v_contract_id := new.contract_id;
  end if;

  update crm.contracts c
  set paid_amount = coalesce(
    (select sum(p.amount) from crm.contract_payments p
      where p.contract_id = c.id and p.paid),
    0
  )
  where c.id = v_contract_id;

  if tg_op = 'UPDATE' and old.contract_id is distinct from new.contract_id then
    update crm.contracts c
    set paid_amount = coalesce(
      (select sum(p.amount) from crm.contract_payments p
        where p.contract_id = c.id and p.paid),
      0
    )
    where c.id = old.contract_id;
  end if;

  return null;
end;
$$;

drop trigger if exists trg_sync_contract_paid_amount on crm.contract_payments;
create trigger trg_sync_contract_paid_amount
after insert or update or delete on crm.contract_payments
for each row execute function crm.sync_contract_paid_amount();


-- record_payment: та же проверка прав и та же вставка, но БЕЗ ручного
-- прибавления к paid_amount — теперь это делает триггер выше.
create or replace function crm.record_payment(
  p_contract_id uuid,
  p_amount numeric,
  p_date date
)
returns crm.contract_payments
language plpgsql
security definer
set search_path = crm, public
as $$
declare
  v_payment crm.contract_payments;
begin
  if not crm.can_write() then
    raise exception 'Read-only role';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Сумма платежа должна быть больше нуля';
  end if;
  if p_date is null then
    raise exception 'Не указана дата платежа';
  end if;
  if not exists (
    select 1
    from crm.contracts c
    join crm.objects o on o.id = c.object_id
    where c.id = p_contract_id
      and (o.building_id is null or crm.can_view_building(o.building_id))
  ) then
    raise exception 'Contract not allowed for this user';
  end if;

  insert into crm.contract_payments (contract_id, due_date, amount, paid, paid_date)
  values (p_contract_id, p_date, p_amount, true, p_date)
  returning * into v_payment;

  return v_payment;
end;
$$;

grant execute on function crm.record_payment(uuid, numeric, date) to authenticated;


-- delete_payment: то же самое, вычитание убрано.
create or replace function crm.delete_payment(p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = crm, public
as $$
begin
  if not crm.is_admin() then
    raise exception 'Only an admin can delete a payment';
  end if;

  delete from crm.contract_payments where id = p_payment_id;
end;
$$;

grant execute on function crm.delete_payment(uuid) to authenticated;


-- ---- Разовое приведение старых данных в порядок ----

-- 1) Деньги, которые числятся на договоре, но не подтверждены ни одной
--    строкой платежа, становятся настоящим платежом. Иначе пересчёт ниже
--    просто стёр бы их.
insert into crm.contract_payments (contract_id, due_date, amount, paid, paid_date)
select
  c.id,
  coalesce(c.signed_date, c.created_at::date),
  c.paid_amount - coalesce(paid.total, 0),
  true,
  coalesce(c.signed_date, c.created_at::date)
from crm.contracts c
left join lateral (
  select sum(p.amount) as total
  from crm.contract_payments p
  where p.contract_id = c.id and p.paid
) paid on true
where c.paid_amount - coalesce(paid.total, 0) > 0.005;

-- 2) Теперь строки — единственный источник правды: пересчитать всё.
update crm.contracts c
set paid_amount = coalesce(
  (select sum(p.amount) from crm.contract_payments p
    where p.contract_id = c.id and p.paid),
  0
)
where c.paid_amount is distinct from coalesce(
  (select sum(p.amount) from crm.contract_payments p
    where p.contract_id = c.id and p.paid),
  0
);

-- ############################################################
-- ### 043_real_overdue.sql
-- ############################################################

-- ============================================================
-- 043: настоящая просрочка — с учётом уже поступивших денег.
--
-- ЧТО БЫЛО НЕ ТАК. Строки графика рассрочки НИКОГДА не помечаются
-- оплаченными. Платёж записывается ОТДЕЛЬНОЙ строкой (paid = true), а
-- строки плана так и остаются paid = false навсегда. Покрытие считает
-- интерфейс: полученные деньги ложатся на план по очереди, от самой
-- старой строки к новой (см. allocatePlan в ContractPayments).
--
-- А страница «Должники» и плитка «Просрочено» на дашборде считали
-- просроченной КАЖДУЮ строку плана с прошедшим сроком — независимо от
-- того, закрыта она деньгами или нет. То есть клиент, аккуратно
-- плативший два года, всё равно висел в должниках с «21 просроченным
-- платежом» и суммой всего графика. Отсюда и цифры, которые не сходятся
-- с реальностью.
--
-- КАК СЧИТАЕМ ТЕПЕРЬ. Ровно та же раскладка, что и в интерфейсе, только
-- в SQL:
--   pool  = paid_amount - (amount - plan_total)
--           то есть поступившие деньги за вычетом первоначального взноса
--           (той части договора, которой в графике никогда не было);
--   для каждой строки плана по возрастанию срока считаем нарастающий
--   итог cum, и непокрытый остаток строки = clamp(cum - pool, 0, amount).
-- Просрочено = непокрытые остатки строк, срок которых уже прошёл.
--
-- Никаких пеней и процентов: просрочка — это ровно те деньги по графику,
-- которые ещё не поступили. Ничего сверху не начисляется.
--
-- Файл идемпотентный -- можно запускать повторно.
-- ============================================================

-- Одна общая раскладка для всех потребителей: и «Должники», и дашборд
-- должны показывать одно и то же число.
--
-- security_invoker: представление читается правами вызывающего, значит RLS
-- (и ограничение менеджера своими ЖК) работает как обычно.
drop view if exists crm.overdue_installments cascade;
create or replace view crm.overdue_installments
with (security_invoker = on)
as
with plan as (
  select
    p.id,
    p.contract_id,
    p.due_date,
    p.amount,
    sum(p.amount) over (
      partition by p.contract_id
      order by p.due_date, p.id
      rows between unbounded preceding and current row
    ) as cum
  from crm.contract_payments p
  where not p.paid
),
ctx as (
  select
    c.id                          as contract_id,
    c.amount                      as contract_amount,
    c.paid_amount,
    coalesce(sum(pl.amount), 0)   as plan_total
  from crm.contracts c
  left join plan pl on pl.contract_id = c.id
  where c.status <> 'cancelled'
  group by c.id, c.amount, c.paid_amount
)
select
  pl.id            as payment_id,
  pl.contract_id,
  pl.due_date,
  pl.amount        as scheduled_amount,
  -- Непокрытый остаток именно этой строки после раскладки поступлений.
  least(
    pl.amount,
    greatest(pl.cum - greatest(ctx.paid_amount - (ctx.contract_amount - ctx.plan_total), 0), 0)
  ) as unpaid_amount
from plan pl
join ctx on ctx.contract_id = pl.contract_id;

grant select on crm.overdue_installments to authenticated;


-- Строка на договор: только реально не закрытые просроченные платежи.
--
-- drop, а не только `create or replace`: у функции появилась новая колонка
-- remaining_total, а менять состав OUT-параметров заменой нельзя --
-- Postgres отвечает «cannot change return type of existing function».
drop function if exists crm.overdue_contracts();
create or replace function crm.overdue_contracts()
returns table (
  contract_id uuid,
  contract_number text,
  client_id uuid,
  client_name text,
  client_phone text,
  object_name text,
  currency text,
  missed_count int,
  total_overdue numeric,
  -- Весь остаток по договору, не только просроченная часть: на экране
  -- эти два числа больше не должны путаться друг с другом.
  remaining_total numeric,
  earliest_due date,
  latest_due date
)
language sql
stable
security invoker
set search_path = crm, public
as $$
  select
    c.id,
    c.number,
    cl.id,
    coalesce(cl.name, '—'),
    cl.phone,
    o.name,
    c.currency::text,
    (count(*))::int,
    sum(oi.unpaid_amount),
    greatest(c.amount - c.paid_amount, 0),
    min(oi.due_date),
    max(oi.due_date)
  from crm.overdue_installments oi
  join crm.contracts c on c.id = oi.contract_id
  left join crm.clients cl on cl.id = c.client_id
  left join crm.objects  o  on o.id = c.object_id
  where oi.due_date < current_date
    -- Копейки округления — не долг.
    and oi.unpaid_amount > 0.005
  group by c.id, c.number, cl.id, cl.name, cl.phone, o.name, c.currency, c.amount, c.paid_amount
  order by sum(oi.unpaid_amount) desc, c.id;
$$;

grant execute on function crm.overdue_contracts() to authenticated;


-- Та же история: добавился remaining_total.
drop function if exists crm.overdue_totals();
create or replace function crm.overdue_totals()
returns table (
  currency text,
  contracts int,
  total_overdue numeric,
  remaining_total numeric
)
language sql
stable
security invoker
set search_path = crm, public
as $$
  with per_contract as (
    select
      c.id,
      c.currency,
      sum(oi.unpaid_amount)                  as overdue,
      greatest(c.amount - c.paid_amount, 0)  as remaining
    from crm.overdue_installments oi
    join crm.contracts c on c.id = oi.contract_id
    where oi.due_date < current_date
      and oi.unpaid_amount > 0.005
    group by c.id, c.currency, c.amount, c.paid_amount
  )
  select
    currency::text,
    (count(*))::int,
    sum(overdue),
    sum(remaining)
  from per_contract
  group by currency
  order by sum(overdue) desc;
$$;

grant execute on function crm.overdue_totals() to authenticated;


-- Плитка «Просрочено» на дашборде считала так же неверно, как и страница
-- должников. Пересобираем dashboard_summary с той же раскладкой -- иначе
-- два экрана показывали бы разные числа про одно и то же.
create or replace function crm.dashboard_summary(
  p_building_id uuid default null,
  p_from date default null,
  p_to date default null
)
returns jsonb
language sql
stable
security invoker
set search_path = crm, public
as $$
with
scoped_objects as (
  select o.id, o.status, o.building_id, o.price, o.currency, o.area
  from crm.objects o
  left join crm.buildings b on b.id = o.building_id
  where case
          when p_building_id is not null then o.building_id = p_building_id
          else coalesce(b.construction_status, 'in_progress') <> 'completed'
        end
),
scoped_contracts as (
  select c.id, c.client_id, c.amount, c.paid_amount, c.currency,
         c.signed_date, c.status, so.building_id
  from crm.contracts c
  join scoped_objects so on so.id = c.object_id
),
live_contracts as (
  select *
  from scoped_contracts
  where status <> 'cancelled'
    and (p_from is null or (signed_date is not null and signed_date >= p_from))
    and (p_to   is null or (signed_date is not null and signed_date <= p_to))
),
rel_buildings as (
  select b.id, b.name
  from crm.buildings b
  where case
          when p_building_id is not null then b.id = p_building_id
          else b.construction_status <> 'completed'
        end
),
obj_stats as (
  select
    (count(*))::int                                             as total,
    (count(*) filter (where status = 'available'))::int         as available,
    (count(*) filter (where status = 'reserved'))::int          as reserved,
    (count(*) filter (where status = 'sold'))::int              as sold,
    (count(*) filter (where status = 'in_progress'))::int       as in_progress,
    coalesce(sum(area), 0)                                    as area_total,
    coalesce(sum(area) filter (where status = 'available'), 0) as area_available,
    coalesce(sum(price) filter (where status = 'available' and currency <> 'USD'), 0) as pot_tjs,
    coalesce(sum(price) filter (where status = 'available' and currency  = 'USD'), 0) as pot_usd
  from scoped_objects
),
money as (
  select
    coalesce(sum(paid_amount) filter (where currency <> 'USD'), 0) as paid_tjs,
    coalesce(sum(paid_amount) filter (where currency  = 'USD'), 0) as paid_usd,
    coalesce(sum(greatest(amount - paid_amount, 0)) filter (where currency <> 'USD'), 0) as debt_tjs,
    coalesce(sum(greatest(amount - paid_amount, 0)) filter (where currency  = 'USD'), 0) as debt_usd
  from live_contracts
),
-- Просрочка по той же раскладке, что и на странице должников.
overdue as (
  select
    coalesce(sum(oi.unpaid_amount) filter (where c.currency <> 'USD'), 0) as tjs,
    coalesce(sum(oi.unpaid_amount) filter (where c.currency  = 'USD'), 0) as usd
  from crm.overdue_installments oi
  join scoped_contracts c on c.id = oi.contract_id
  where oi.due_date < current_date
    and oi.unpaid_amount > 0.005
    and c.status <> 'cancelled'
),
month_rev as (
  select
    to_char(signed_date, 'YYYY-MM')                            as month,
    coalesce(sum(amount) filter (where currency <> 'USD'), 0)  as tjs,
    coalesce(sum(amount) filter (where currency  = 'USD'), 0)  as usd
  from scoped_contracts
  where status <> 'cancelled' and signed_date is not null
  group by 1
  order by 1 desc
  limit 6
),
day_rev as (
  select
    p.paid_date                                                 as day,
    coalesce(sum(p.amount) filter (where c.currency <> 'USD'), 0) as tjs,
    coalesce(sum(p.amount) filter (where c.currency  = 'USD'), 0) as usd
  from crm.contract_payments p
  join scoped_contracts c on c.id = p.contract_id
  where p.paid
    and p.paid_date is not null
    and p_from is not null
    and p_to is not null
    and p.paid_date between p_from and p_to
  group by 1
),
occ as (
  select
    rb.id, rb.name,
    (count(*))::int                                          as total,
    (count(*) filter (where so.status = 'available'))::int    as available,
    (count(*) filter (where so.status = 'reserved'))::int     as reserved,
    (count(*) filter (where so.status = 'sold'))::int         as sold,
    (count(*) filter (where so.status = 'rented'))::int       as rented,
    (count(*) filter (where so.status = 'in_progress'))::int  as in_progress
  from rel_buildings rb
  join scoped_objects so on so.building_id = rb.id
  group by rb.id, rb.name
),
bld_rev as (
  select
    rb.id, rb.name,
    coalesce(sum(lc.amount) filter (where lc.currency <> 'USD'), 0) as tjs,
    coalesce(sum(lc.amount) filter (where lc.currency  = 'USD'), 0) as usd
  from rel_buildings rb
  join live_contracts lc on lc.building_id = rb.id
  group by rb.id, rb.name
),
debtors as (
  select
    lc.client_id,
    cl.name,
    lc.currency::text                       as currency,
    sum(lc.amount - lc.paid_amount)         as remaining
  from live_contracts lc
  join crm.clients cl on cl.id = lc.client_id
  where lc.amount - lc.paid_amount > 0
  group by 1, 2, 3
  order by 4 desc
  limit 5
),
completed as (
  select
    (select count(*) from crm.buildings where construction_status = 'completed')::int as buildings,
    (select count(*)
       from crm.objects o
       join crm.buildings b on b.id = o.building_id
      where b.construction_status = 'completed')::int as units
)
select jsonb_build_object(
  'counts', (
    select jsonb_build_object(
      'total', total, 'available', available, 'reserved', reserved,
      'sold', sold, 'in_progress', in_progress
    ) from obj_stats
  ),
  'area', (select jsonb_build_object('total', area_total, 'available', area_available) from obj_stats),
  'potential', (select jsonb_build_object('tjs', pot_tjs, 'usd', pot_usd) from obj_stats),
  'paid', (select jsonb_build_object('tjs', paid_tjs, 'usd', paid_usd) from money),
  'debt', (select jsonb_build_object('tjs', debt_tjs, 'usd', debt_usd) from money),
  'overdue', (select jsonb_build_object('tjs', tjs, 'usd', usd) from overdue),
  'revenue_months', coalesce((
    select jsonb_agg(jsonb_build_object('month', month, 'tjs', tjs, 'usd', usd) order by month)
    from month_rev
  ), '[]'::jsonb),
  'revenue_days', coalesce((
    select jsonb_agg(jsonb_build_object('day', day, 'tjs', tjs, 'usd', usd) order by day)
    from day_rev
  ), '[]'::jsonb),
  'occupancy', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', id, 'name', name, 'total', total,
      'available', available, 'reserved', reserved, 'sold', sold,
      'rented', rented, 'in_progress', in_progress
    ) order by name)
    from occ
  ), '[]'::jsonb),
  'revenue_by_building', coalesce((
    select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'tjs', tjs, 'usd', usd)
                     order by (tjs + usd) desc)
    from bld_rev where tjs > 0 or usd > 0
  ), '[]'::jsonb),
  'top_debtors', coalesce((
    select jsonb_agg(jsonb_build_object(
      'client_id', client_id, 'name', name, 'currency', currency, 'remaining', remaining
    ) order by remaining desc)
    from debtors
  ), '[]'::jsonb),
  'completed', (select jsonb_build_object('buildings', buildings, 'units', units) from completed)
);
$$;

grant execute on function crm.dashboard_summary(uuid, date, date) to authenticated;

-- ############################################################
-- ### 044_potential_revenue_detail.sql
-- ############################################################

-- ============================================================
-- 044: плитка «Потенциальная выручка» перестаёт врать молча.
--
-- ЧТО БЫЛО НЕ ТАК. Плитка складывает цены свободных квартир. Но у
-- квартиры цена может быть НЕ ЗАПОЛНЕНА (price is null) — такая просто
-- не попадает в сумму. На экране это выглядит как «потенциал 800 000»
-- при сорока свободных квартирах: цифра занижена, и понять почему
-- невозможно, потому что нигде не сказано, что половина квартир вообще
-- без цены.
--
-- Считать их «по нулю» нельзя (это и есть текущее враньё), выдумывать им
-- цену — тем более. Единственный честный вариант: показать рядом, из
-- скольких свободных квартир сложилась сумма и у скольких цены нет.
-- Тогда число либо подтверждается, либо сразу видно, что заполнить.
--
-- Здесь только два новых поля в ответе dashboard_summary; вся остальная
-- логика функции не меняется.
--
-- Файл идемпотентный -- можно запускать повторно.
-- ============================================================

create or replace function crm.dashboard_summary(
  p_building_id uuid default null,
  p_from date default null,
  p_to date default null
)
returns jsonb
language sql
stable
security invoker
set search_path = crm, public
as $$
with
scoped_objects as (
  select o.id, o.status, o.building_id, o.price, o.currency, o.area
  from crm.objects o
  left join crm.buildings b on b.id = o.building_id
  where case
          when p_building_id is not null then o.building_id = p_building_id
          else coalesce(b.construction_status, 'in_progress') <> 'completed'
        end
),
scoped_contracts as (
  select c.id, c.client_id, c.amount, c.paid_amount, c.currency,
         c.signed_date, c.status, so.building_id
  from crm.contracts c
  join scoped_objects so on so.id = c.object_id
),
live_contracts as (
  select *
  from scoped_contracts
  where status <> 'cancelled'
    and (p_from is null or (signed_date is not null and signed_date >= p_from))
    and (p_to   is null or (signed_date is not null and signed_date <= p_to))
),
rel_buildings as (
  select b.id, b.name
  from crm.buildings b
  where case
          when p_building_id is not null then b.id = p_building_id
          else b.construction_status <> 'completed'
        end
),
obj_stats as (
  select
    (count(*))::int                                             as total,
    (count(*) filter (where status = 'available'))::int         as available,
    (count(*) filter (where status = 'reserved'))::int          as reserved,
    (count(*) filter (where status = 'sold'))::int              as sold,
    (count(*) filter (where status = 'in_progress'))::int       as in_progress,
    coalesce(sum(area), 0)                                    as area_total,
    coalesce(sum(area) filter (where status = 'available'), 0) as area_available,
    coalesce(sum(price) filter (where status = 'available' and currency <> 'USD'), 0) as pot_tjs,
    coalesce(sum(price) filter (where status = 'available' and currency  = 'USD'), 0) as pot_usd,
    -- Из скольких квартир сложилась эта сумма...
    (count(*) filter (where status = 'available' and price is not null and price > 0))::int
      as pot_units,
    -- ...и сколько свободных квартир в неё НЕ попали, потому что у них нет цены.
    (count(*) filter (where status = 'available' and (price is null or price = 0)))::int
      as pot_no_price
  from scoped_objects
),
money as (
  select
    coalesce(sum(paid_amount) filter (where currency <> 'USD'), 0) as paid_tjs,
    coalesce(sum(paid_amount) filter (where currency  = 'USD'), 0) as paid_usd,
    coalesce(sum(greatest(amount - paid_amount, 0)) filter (where currency <> 'USD'), 0) as debt_tjs,
    coalesce(sum(greatest(amount - paid_amount, 0)) filter (where currency  = 'USD'), 0) as debt_usd
  from live_contracts
),
overdue as (
  select
    coalesce(sum(oi.unpaid_amount) filter (where c.currency <> 'USD'), 0) as tjs,
    coalesce(sum(oi.unpaid_amount) filter (where c.currency  = 'USD'), 0) as usd,
    (count(distinct c.id))::int                                          as contracts
  from crm.overdue_installments oi
  join scoped_contracts c on c.id = oi.contract_id
  where oi.due_date < current_date
    and oi.unpaid_amount > 0.005
    and c.status <> 'cancelled'
),
month_rev as (
  select
    to_char(signed_date, 'YYYY-MM')                            as month,
    coalesce(sum(amount) filter (where currency <> 'USD'), 0)  as tjs,
    coalesce(sum(amount) filter (where currency  = 'USD'), 0)  as usd
  from scoped_contracts
  where status <> 'cancelled' and signed_date is not null
  group by 1
  order by 1 desc
  limit 6
),
day_rev as (
  select
    p.paid_date                                                 as day,
    coalesce(sum(p.amount) filter (where c.currency <> 'USD'), 0) as tjs,
    coalesce(sum(p.amount) filter (where c.currency  = 'USD'), 0) as usd
  from crm.contract_payments p
  join scoped_contracts c on c.id = p.contract_id
  where p.paid
    and p.paid_date is not null
    and p_from is not null
    and p_to is not null
    and p.paid_date between p_from and p_to
  group by 1
),
occ as (
  select
    rb.id, rb.name,
    (count(*))::int                                          as total,
    (count(*) filter (where so.status = 'available'))::int    as available,
    (count(*) filter (where so.status = 'reserved'))::int     as reserved,
    (count(*) filter (where so.status = 'sold'))::int         as sold,
    (count(*) filter (where so.status = 'rented'))::int       as rented,
    (count(*) filter (where so.status = 'in_progress'))::int  as in_progress
  from rel_buildings rb
  join scoped_objects so on so.building_id = rb.id
  group by rb.id, rb.name
),
bld_rev as (
  select
    rb.id, rb.name,
    coalesce(sum(lc.amount) filter (where lc.currency <> 'USD'), 0) as tjs,
    coalesce(sum(lc.amount) filter (where lc.currency  = 'USD'), 0) as usd
  from rel_buildings rb
  join live_contracts lc on lc.building_id = rb.id
  group by rb.id, rb.name
),
debtors as (
  select
    lc.client_id,
    cl.name,
    lc.currency::text                       as currency,
    sum(lc.amount - lc.paid_amount)         as remaining
  from live_contracts lc
  join crm.clients cl on cl.id = lc.client_id
  where lc.amount - lc.paid_amount > 0
  group by 1, 2, 3
  order by 4 desc
  limit 5
),
completed as (
  select
    (select count(*) from crm.buildings where construction_status = 'completed')::int as buildings,
    (select count(*)
       from crm.objects o
       join crm.buildings b on b.id = o.building_id
      where b.construction_status = 'completed')::int as units
)
select jsonb_build_object(
  'counts', (
    select jsonb_build_object(
      'total', total, 'available', available, 'reserved', reserved,
      'sold', sold, 'in_progress', in_progress
    ) from obj_stats
  ),
  'area', (select jsonb_build_object('total', area_total, 'available', area_available) from obj_stats),
  'potential', (select jsonb_build_object('tjs', pot_tjs, 'usd', pot_usd) from obj_stats),
  'potential_units', (select pot_units from obj_stats),
  'potential_no_price', (select pot_no_price from obj_stats),
  'paid', (select jsonb_build_object('tjs', paid_tjs, 'usd', paid_usd) from money),
  'debt', (select jsonb_build_object('tjs', debt_tjs, 'usd', debt_usd) from money),
  'overdue', (select jsonb_build_object('tjs', tjs, 'usd', usd) from overdue),
  'overdue_contracts', (select contracts from overdue),
  'revenue_months', coalesce((
    select jsonb_agg(jsonb_build_object('month', month, 'tjs', tjs, 'usd', usd) order by month)
    from month_rev
  ), '[]'::jsonb),
  'revenue_days', coalesce((
    select jsonb_agg(jsonb_build_object('day', day, 'tjs', tjs, 'usd', usd) order by day)
    from day_rev
  ), '[]'::jsonb),
  'occupancy', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', id, 'name', name, 'total', total,
      'available', available, 'reserved', reserved, 'sold', sold,
      'rented', rented, 'in_progress', in_progress
    ) order by name)
    from occ
  ), '[]'::jsonb),
  'revenue_by_building', coalesce((
    select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'tjs', tjs, 'usd', usd)
                     order by (tjs + usd) desc)
    from bld_rev where tjs > 0 or usd > 0
  ), '[]'::jsonb),
  'top_debtors', coalesce((
    select jsonb_agg(jsonb_build_object(
      'client_id', client_id, 'name', name, 'currency', currency, 'remaining', remaining
    ) order by remaining desc)
    from debtors
  ), '[]'::jsonb),
  'completed', (select jsonb_build_object('buildings', buildings, 'units', units) from completed)
);
$$;

grant execute on function crm.dashboard_summary(uuid, date, date) to authenticated;

-- ############################################################
-- ### 045_area_split_and_overdue_by_building.sql
-- ############################################################

-- ============================================================
-- 045: данные под новые графики.
--
--  1. Площадь по статусам — чтобы «Общая площадь / Осталось в продаже»
--     перестали быть двумя плитками и стали одним кольцом «продано /
--     забронировано / в продаже». Раньше отдавались только total и
--     available, а проданной площади не было вовсе — её нельзя было
--     получить вычитанием, потому что между ними ещё брони и «в работе».
--
--  2. Просрочка с разбивкой по ЖК и фильтром по ЖК — страница «Должники»
--     показывает просрочку графиком по объектам, и в фильтре появляется
--     выбор ЖК.
--
-- ВНИМАНИЕ на DROP. У overdue_contracts/overdue_totals меняется И состав
-- колонок, И сигнатура (появляется параметр). Ни то, ни другое
-- `create or replace` не умеет: по колонкам Postgres отвечает «cannot
-- change return type», а добавление параметра со значением по умолчанию
-- создало бы ВТОРУЮ перегрузку — и вызов без аргументов стал бы
-- неоднозначным. Поэтому обе удаляются явно.
--
-- Файл идемпотентный -- можно запускать повторно.
-- ============================================================

-- ---- 1. Просрочка по ЖК ----

drop function if exists crm.overdue_contracts();
drop function if exists crm.overdue_contracts(uuid);
create function crm.overdue_contracts(p_building_id uuid default null)
returns table (
  contract_id uuid,
  contract_number text,
  client_id uuid,
  client_name text,
  client_phone text,
  object_name text,
  building_id uuid,
  building_name text,
  currency text,
  missed_count int,
  total_overdue numeric,
  remaining_total numeric,
  earliest_due date,
  latest_due date
)
language sql
stable
security invoker
set search_path = crm, public
as $$
  select
    c.id,
    c.number,
    cl.id,
    coalesce(cl.name, '—'),
    cl.phone,
    o.name,
    o.building_id,
    b.name,
    c.currency::text,
    (count(*))::int,
    sum(oi.unpaid_amount),
    greatest(c.amount - c.paid_amount, 0),
    min(oi.due_date),
    max(oi.due_date)
  from crm.overdue_installments oi
  join crm.contracts c on c.id = oi.contract_id
  left join crm.clients   cl on cl.id = c.client_id
  left join crm.objects   o  on o.id = c.object_id
  left join crm.buildings b  on b.id = o.building_id
  where oi.due_date < current_date
    and oi.unpaid_amount > 0.005
    and (p_building_id is null or o.building_id = p_building_id)
  group by c.id, c.number, cl.id, cl.name, cl.phone, o.name, o.building_id, b.name,
           c.currency, c.amount, c.paid_amount
  order by sum(oi.unpaid_amount) desc, c.id;
$$;

grant execute on function crm.overdue_contracts(uuid) to authenticated;


drop function if exists crm.overdue_totals();
drop function if exists crm.overdue_totals(uuid);
create function crm.overdue_totals(p_building_id uuid default null)
returns table (
  currency text,
  contracts int,
  total_overdue numeric,
  remaining_total numeric
)
language sql
stable
security invoker
set search_path = crm, public
as $$
  with per_contract as (
    select
      c.id,
      c.currency,
      sum(oi.unpaid_amount)                  as overdue,
      greatest(c.amount - c.paid_amount, 0)  as remaining
    from crm.overdue_installments oi
    join crm.contracts c on c.id = oi.contract_id
    left join crm.objects o on o.id = c.object_id
    where oi.due_date < current_date
      and oi.unpaid_amount > 0.005
      and (p_building_id is null or o.building_id = p_building_id)
    group by c.id, c.currency, c.amount, c.paid_amount
  )
  select currency::text, (count(*))::int, sum(overdue), sum(remaining)
  from per_contract
  group by currency
  order by sum(overdue) desc;
$$;

grant execute on function crm.overdue_totals(uuid) to authenticated;


-- Просрочка, сгруппированная по ЖК: ровно то, что рисует график на
-- странице должников. Объекты без ЖК собираются в одну строку с NULL --
-- терять их нельзя, долг есть долг.
drop function if exists crm.overdue_by_building();
create function crm.overdue_by_building()
returns table (
  building_id uuid,
  building_name text,
  currency text,
  contracts int,
  total_overdue numeric
)
language sql
stable
security invoker
set search_path = crm, public
as $$
  select
    o.building_id,
    coalesce(b.name, '—'),
    c.currency::text,
    (count(distinct c.id))::int,
    sum(oi.unpaid_amount)
  from crm.overdue_installments oi
  join crm.contracts c on c.id = oi.contract_id
  left join crm.objects   o on o.id = c.object_id
  left join crm.buildings b on b.id = o.building_id
  where oi.due_date < current_date
    and oi.unpaid_amount > 0.005
  group by o.building_id, b.name, c.currency
  order by sum(oi.unpaid_amount) desc;
$$;

grant execute on function crm.overdue_by_building() to authenticated;


-- ---- 2. Площадь по статусам в dashboard_summary ----

create or replace function crm.dashboard_summary(
  p_building_id uuid default null,
  p_from date default null,
  p_to date default null
)
returns jsonb
language sql
stable
security invoker
set search_path = crm, public
as $$
with
scoped_objects as (
  select o.id, o.status, o.building_id, o.price, o.currency, o.area
  from crm.objects o
  left join crm.buildings b on b.id = o.building_id
  where case
          when p_building_id is not null then o.building_id = p_building_id
          else coalesce(b.construction_status, 'in_progress') <> 'completed'
        end
),
scoped_contracts as (
  select c.id, c.client_id, c.amount, c.paid_amount, c.currency,
         c.signed_date, c.status, so.building_id
  from crm.contracts c
  join scoped_objects so on so.id = c.object_id
),
live_contracts as (
  select *
  from scoped_contracts
  where status <> 'cancelled'
    and (p_from is null or (signed_date is not null and signed_date >= p_from))
    and (p_to   is null or (signed_date is not null and signed_date <= p_to))
),
rel_buildings as (
  select b.id, b.name
  from crm.buildings b
  where case
          when p_building_id is not null then b.id = p_building_id
          else b.construction_status <> 'completed'
        end
),
obj_stats as (
  select
    (count(*))::int                                             as total,
    (count(*) filter (where status = 'available'))::int         as available,
    (count(*) filter (where status = 'reserved'))::int          as reserved,
    (count(*) filter (where status = 'sold'))::int              as sold,
    (count(*) filter (where status = 'in_progress'))::int       as in_progress,
    coalesce(sum(area), 0)                                      as area_total,
    coalesce(sum(area) filter (where status = 'available'), 0)   as area_available,
    coalesce(sum(area) filter (where status = 'reserved'), 0)    as area_reserved,
    coalesce(sum(area) filter (where status = 'sold'), 0)        as area_sold,
    coalesce(sum(area) filter (where status = 'rented'), 0)      as area_rented,
    coalesce(sum(area) filter (where status = 'in_progress'), 0) as area_in_progress,
    coalesce(sum(price) filter (where status = 'available' and currency <> 'USD'), 0) as pot_tjs,
    coalesce(sum(price) filter (where status = 'available' and currency  = 'USD'), 0) as pot_usd,
    (count(*) filter (where status = 'available' and price is not null and price > 0))::int
      as pot_units,
    (count(*) filter (where status = 'available' and (price is null or price = 0)))::int
      as pot_no_price
  from scoped_objects
),
money as (
  select
    coalesce(sum(paid_amount) filter (where currency <> 'USD'), 0) as paid_tjs,
    coalesce(sum(paid_amount) filter (where currency  = 'USD'), 0) as paid_usd,
    coalesce(sum(greatest(amount - paid_amount, 0)) filter (where currency <> 'USD'), 0) as debt_tjs,
    coalesce(sum(greatest(amount - paid_amount, 0)) filter (where currency  = 'USD'), 0) as debt_usd
  from live_contracts
),
overdue as (
  select
    coalesce(sum(oi.unpaid_amount) filter (where c.currency <> 'USD'), 0) as tjs,
    coalesce(sum(oi.unpaid_amount) filter (where c.currency  = 'USD'), 0) as usd,
    (count(distinct c.id))::int                                          as contracts
  from crm.overdue_installments oi
  join scoped_contracts c on c.id = oi.contract_id
  where oi.due_date < current_date
    and oi.unpaid_amount > 0.005
    and c.status <> 'cancelled'
),
month_rev as (
  select
    to_char(signed_date, 'YYYY-MM')                            as month,
    coalesce(sum(amount) filter (where currency <> 'USD'), 0)  as tjs,
    coalesce(sum(amount) filter (where currency  = 'USD'), 0)  as usd
  from scoped_contracts
  where status <> 'cancelled' and signed_date is not null
  group by 1
  order by 1 desc
  limit 6
),
day_rev as (
  select
    p.paid_date                                                 as day,
    coalesce(sum(p.amount) filter (where c.currency <> 'USD'), 0) as tjs,
    coalesce(sum(p.amount) filter (where c.currency  = 'USD'), 0) as usd
  from crm.contract_payments p
  join scoped_contracts c on c.id = p.contract_id
  where p.paid
    and p.paid_date is not null
    and p_from is not null
    and p_to is not null
    and p.paid_date between p_from and p_to
  group by 1
),
occ as (
  select
    rb.id, rb.name,
    (count(*))::int                                          as total,
    (count(*) filter (where so.status = 'available'))::int    as available,
    (count(*) filter (where so.status = 'reserved'))::int     as reserved,
    (count(*) filter (where so.status = 'sold'))::int         as sold,
    (count(*) filter (where so.status = 'rented'))::int       as rented,
    (count(*) filter (where so.status = 'in_progress'))::int  as in_progress
  from rel_buildings rb
  join scoped_objects so on so.building_id = rb.id
  group by rb.id, rb.name
),
bld_rev as (
  select
    rb.id, rb.name,
    coalesce(sum(lc.amount) filter (where lc.currency <> 'USD'), 0) as tjs,
    coalesce(sum(lc.amount) filter (where lc.currency  = 'USD'), 0) as usd
  from rel_buildings rb
  join live_contracts lc on lc.building_id = rb.id
  group by rb.id, rb.name
),
debtors as (
  select
    lc.client_id,
    cl.name,
    lc.currency::text                       as currency,
    sum(lc.amount - lc.paid_amount)         as remaining
  from live_contracts lc
  join crm.clients cl on cl.id = lc.client_id
  where lc.amount - lc.paid_amount > 0
  group by 1, 2, 3
  order by 4 desc
  limit 5
),
completed as (
  select
    (select count(*) from crm.buildings where construction_status = 'completed')::int as buildings,
    (select count(*)
       from crm.objects o
       join crm.buildings b on b.id = o.building_id
      where b.construction_status = 'completed')::int as units
)
select jsonb_build_object(
  'counts', (
    select jsonb_build_object(
      'total', total, 'available', available, 'reserved', reserved,
      'sold', sold, 'in_progress', in_progress
    ) from obj_stats
  ),
  'area', (select jsonb_build_object('total', area_total, 'available', area_available) from obj_stats),
  'area_split', (
    select jsonb_build_object(
      'sold', area_sold, 'reserved', area_reserved, 'available', area_available,
      'rented', area_rented, 'in_progress', area_in_progress
    ) from obj_stats
  ),
  'potential', (select jsonb_build_object('tjs', pot_tjs, 'usd', pot_usd) from obj_stats),
  'potential_units', (select pot_units from obj_stats),
  'potential_no_price', (select pot_no_price from obj_stats),
  'paid', (select jsonb_build_object('tjs', paid_tjs, 'usd', paid_usd) from money),
  'debt', (select jsonb_build_object('tjs', debt_tjs, 'usd', debt_usd) from money),
  'overdue', (select jsonb_build_object('tjs', tjs, 'usd', usd) from overdue),
  'overdue_contracts', (select contracts from overdue),
  'revenue_months', coalesce((
    select jsonb_agg(jsonb_build_object('month', month, 'tjs', tjs, 'usd', usd) order by month)
    from month_rev
  ), '[]'::jsonb),
  'revenue_days', coalesce((
    select jsonb_agg(jsonb_build_object('day', day, 'tjs', tjs, 'usd', usd) order by day)
    from day_rev
  ), '[]'::jsonb),
  'occupancy', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', id, 'name', name, 'total', total,
      'available', available, 'reserved', reserved, 'sold', sold,
      'rented', rented, 'in_progress', in_progress
    ) order by name)
    from occ
  ), '[]'::jsonb),
  'revenue_by_building', coalesce((
    select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'tjs', tjs, 'usd', usd)
                     order by (tjs + usd) desc)
    from bld_rev where tjs > 0 or usd > 0
  ), '[]'::jsonb),
  'top_debtors', coalesce((
    select jsonb_agg(jsonb_build_object(
      'client_id', client_id, 'name', name, 'currency', currency, 'remaining', remaining
    ) order by remaining desc)
    from debtors
  ), '[]'::jsonb),
  'completed', (select jsonb_build_object('buildings', buildings, 'units', units) from completed)
);
$$;

grant execute on function crm.dashboard_summary(uuid, date, date) to authenticated;

-- ############################################################
-- ### 046_gapless_revenue_series.sql
-- ############################################################

-- ============================================================
-- 046: график выручки — без пропусков в оси времени.
--
-- ЧТО БЫЛО НЕ ТАК. month_rev группировал договоры по месяцу подписания и
-- отдавал ТОЛЬКО те месяцы, в которых подписания были. На экране это
-- давало ось «2026-02, 2026-03, 2026-05, 2026-06...» — апреля просто
-- нет. Для линейного графика это не косметика, а искажение: отрезок
-- между мартом и маем рисуется так, будто это соседние месяцы, и наклон
-- (то есть сам тренд, ради которого график и существует) получается
-- неверным. Месяц без продаж — это ноль, а не отсутствие точки.
--
-- То же самое у графика по дням: день без поступлений выпадал из оси.
--
-- КАК ТЕПЕРЬ. Ось строится generate_series по календарю, а суммы
-- подтягиваются к ней через left join. Нет продаж — ровно 0 на своём
-- месте.
--
-- Окно месяцев отсчитывается назад от ПОСЛЕДНЕГО месяца с подписанием, а
-- не от текущей даты: если в базе даты подписания уходят вперёд или,
-- наоборот, последняя продажа была давно, окно всё равно попадает туда,
-- где данные есть.
--
-- Файл идемпотентный -- можно запускать повторно.
-- ============================================================

create or replace function crm.dashboard_summary(
  p_building_id uuid default null,
  p_from date default null,
  p_to date default null
)
returns jsonb
language sql
stable
security invoker
set search_path = crm, public
as $$
with
scoped_objects as (
  select o.id, o.status, o.building_id, o.price, o.currency, o.area
  from crm.objects o
  left join crm.buildings b on b.id = o.building_id
  where case
          when p_building_id is not null then o.building_id = p_building_id
          else coalesce(b.construction_status, 'in_progress') <> 'completed'
        end
),
scoped_contracts as (
  select c.id, c.client_id, c.amount, c.paid_amount, c.currency,
         c.signed_date, c.status, so.building_id
  from crm.contracts c
  join scoped_objects so on so.id = c.object_id
),
live_contracts as (
  select *
  from scoped_contracts
  where status <> 'cancelled'
    and (p_from is null or (signed_date is not null and signed_date >= p_from))
    and (p_to   is null or (signed_date is not null and signed_date <= p_to))
),
rel_buildings as (
  select b.id, b.name
  from crm.buildings b
  where case
          when p_building_id is not null then b.id = p_building_id
          else b.construction_status <> 'completed'
        end
),
obj_stats as (
  select
    (count(*))::int                                             as total,
    (count(*) filter (where status = 'available'))::int         as available,
    (count(*) filter (where status = 'reserved'))::int          as reserved,
    (count(*) filter (where status = 'sold'))::int              as sold,
    (count(*) filter (where status = 'in_progress'))::int       as in_progress,
    coalesce(sum(area), 0)                                      as area_total,
    coalesce(sum(area) filter (where status = 'available'), 0)   as area_available,
    coalesce(sum(area) filter (where status = 'reserved'), 0)    as area_reserved,
    coalesce(sum(area) filter (where status = 'sold'), 0)        as area_sold,
    coalesce(sum(area) filter (where status = 'rented'), 0)      as area_rented,
    coalesce(sum(area) filter (where status = 'in_progress'), 0) as area_in_progress,
    coalesce(sum(price) filter (where status = 'available' and currency <> 'USD'), 0) as pot_tjs,
    coalesce(sum(price) filter (where status = 'available' and currency  = 'USD'), 0) as pot_usd,
    (count(*) filter (where status = 'available' and price is not null and price > 0))::int
      as pot_units,
    (count(*) filter (where status = 'available' and (price is null or price = 0)))::int
      as pot_no_price
  from scoped_objects
),
money as (
  select
    coalesce(sum(paid_amount) filter (where currency <> 'USD'), 0) as paid_tjs,
    coalesce(sum(paid_amount) filter (where currency  = 'USD'), 0) as paid_usd,
    coalesce(sum(greatest(amount - paid_amount, 0)) filter (where currency <> 'USD'), 0) as debt_tjs,
    coalesce(sum(greatest(amount - paid_amount, 0)) filter (where currency  = 'USD'), 0) as debt_usd
  from live_contracts
),
overdue as (
  select
    coalesce(sum(oi.unpaid_amount) filter (where c.currency <> 'USD'), 0) as tjs,
    coalesce(sum(oi.unpaid_amount) filter (where c.currency  = 'USD'), 0) as usd,
    (count(distinct c.id))::int                                          as contracts
  from crm.overdue_installments oi
  join scoped_contracts c on c.id = oi.contract_id
  where oi.due_date < current_date
    and oi.unpaid_amount > 0.005
    and c.status <> 'cancelled'
),
-- The end of the window: the last month that actually has a signing, so the
-- chart lands where the data is even if the newest contract is not this month.
month_end as (
  select coalesce(
           date_trunc('month', max(signed_date)),
           date_trunc('month', current_date)
         ) as m
  from scoped_contracts
  where status <> 'cancelled' and signed_date is not null
),
-- Six consecutive calendar months. A month with no sales must be a zero on the
-- axis, not a missing point.
month_axis as (
  select to_char(g, 'YYYY-MM') as month
  from month_end me,
       generate_series(me.m - interval '5 months', me.m, interval '1 month') as g
),
month_rev as (
  select
    ax.month,
    coalesce(sum(c.amount) filter (where c.currency <> 'USD'), 0) as tjs,
    coalesce(sum(c.amount) filter (where c.currency  = 'USD'), 0) as usd
  from month_axis ax
  left join scoped_contracts c
         on c.status <> 'cancelled'
        and c.signed_date is not null
        and to_char(c.signed_date, 'YYYY-MM') = ax.month
  group by ax.month
  order by ax.month
),
-- Same treatment for the daily chart: every day in the chosen period appears,
-- including the ones with no money received.
day_axis as (
  select g::date as day
  from generate_series(
         coalesce(p_from, current_date),
         coalesce(p_to, current_date),
         interval '1 day'
       ) as g
  where p_from is not null and p_to is not null
),
day_rev as (
  select
    ax.day,
    coalesce(sum(p.amount) filter (where c.currency <> 'USD'), 0) as tjs,
    coalesce(sum(p.amount) filter (where c.currency  = 'USD'), 0) as usd
  from day_axis ax
  left join crm.contract_payments p
         on p.paid and p.paid_date = ax.day
  left join scoped_contracts c on c.id = p.contract_id
  group by ax.day
  order by ax.day
),
occ as (
  select
    rb.id, rb.name,
    (count(*))::int                                          as total,
    (count(*) filter (where so.status = 'available'))::int    as available,
    (count(*) filter (where so.status = 'reserved'))::int     as reserved,
    (count(*) filter (where so.status = 'sold'))::int         as sold,
    (count(*) filter (where so.status = 'rented'))::int       as rented,
    (count(*) filter (where so.status = 'in_progress'))::int  as in_progress
  from rel_buildings rb
  join scoped_objects so on so.building_id = rb.id
  group by rb.id, rb.name
),
bld_rev as (
  select
    rb.id, rb.name,
    coalesce(sum(lc.amount) filter (where lc.currency <> 'USD'), 0) as tjs,
    coalesce(sum(lc.amount) filter (where lc.currency  = 'USD'), 0) as usd
  from rel_buildings rb
  join live_contracts lc on lc.building_id = rb.id
  group by rb.id, rb.name
),
debtors as (
  select
    lc.client_id,
    cl.name,
    lc.currency::text                       as currency,
    sum(lc.amount - lc.paid_amount)         as remaining
  from live_contracts lc
  join crm.clients cl on cl.id = lc.client_id
  where lc.amount - lc.paid_amount > 0
  group by 1, 2, 3
  order by 4 desc
  limit 5
),
completed as (
  select
    (select count(*) from crm.buildings where construction_status = 'completed')::int as buildings,
    (select count(*)
       from crm.objects o
       join crm.buildings b on b.id = o.building_id
      where b.construction_status = 'completed')::int as units
)
select jsonb_build_object(
  'counts', (
    select jsonb_build_object(
      'total', total, 'available', available, 'reserved', reserved,
      'sold', sold, 'in_progress', in_progress
    ) from obj_stats
  ),
  'area', (select jsonb_build_object('total', area_total, 'available', area_available) from obj_stats),
  'area_split', (
    select jsonb_build_object(
      'sold', area_sold, 'reserved', area_reserved, 'available', area_available,
      'rented', area_rented, 'in_progress', area_in_progress
    ) from obj_stats
  ),
  'potential', (select jsonb_build_object('tjs', pot_tjs, 'usd', pot_usd) from obj_stats),
  'potential_units', (select pot_units from obj_stats),
  'potential_no_price', (select pot_no_price from obj_stats),
  'paid', (select jsonb_build_object('tjs', paid_tjs, 'usd', paid_usd) from money),
  'debt', (select jsonb_build_object('tjs', debt_tjs, 'usd', debt_usd) from money),
  'overdue', (select jsonb_build_object('tjs', tjs, 'usd', usd) from overdue),
  'overdue_contracts', (select contracts from overdue),
  'revenue_months', coalesce((
    select jsonb_agg(jsonb_build_object('month', month, 'tjs', tjs, 'usd', usd) order by month)
    from month_rev
  ), '[]'::jsonb),
  'revenue_days', coalesce((
    select jsonb_agg(jsonb_build_object('day', day, 'tjs', tjs, 'usd', usd) order by day)
    from day_rev
  ), '[]'::jsonb),
  'occupancy', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', id, 'name', name, 'total', total,
      'available', available, 'reserved', reserved, 'sold', sold,
      'rented', rented, 'in_progress', in_progress
    ) order by name)
    from occ
  ), '[]'::jsonb),
  'revenue_by_building', coalesce((
    select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'tjs', tjs, 'usd', usd)
                     order by (tjs + usd) desc)
    from bld_rev where tjs > 0 or usd > 0
  ), '[]'::jsonb),
  'top_debtors', coalesce((
    select jsonb_agg(jsonb_build_object(
      'client_id', client_id, 'name', name, 'currency', currency, 'remaining', remaining
    ) order by remaining desc)
    from debtors
  ), '[]'::jsonb),
  'completed', (select jsonb_build_object('buildings', buildings, 'units', units) from completed)
);
$$;

grant execute on function crm.dashboard_summary(uuid, date, date) to authenticated;

-- ### 047_retire_hero_theme_options.sql

-- ============================================================
-- 047: убраны тема «Уқёнус» и узоры «Ситора», «Панҷара».
--
-- ЗАЧЕМ МИГРАЦИЯ. Тема и узор хранятся в crm.settings как обычный текст,
-- без справочника допустимых значений. Оформление живёт в CSS: правило
-- :root[data-hero-theme="ocean"] удалено вместе с темой. Если в базе
-- осталась строка 'ocean', происходит вот что: на <html> по-прежнему
-- ставится data-hero-theme="ocean", подходящего правила нет, и шапка
-- рисуется цветами по умолчанию (Атлас) — то есть внешне всё работает.
-- Но экран Настройки → Оформление подсвечивает кнопку сравнением
-- values.hero_theme === th.id, а такой кнопки больше нет: ни одна тема не
-- выглядит выбранной, и админ не понимает, что у него включено.
--
-- Поэтому приводим базу в соответствие с интерфейсом: снятые значения
-- становятся NULL, что и означает «Атлас» и «Ҳамвор» (без узора) —
-- ровно то, что и так видит пользователь.
--
-- Ничьи данные это не затрагивает: в колонках лежит только выбор
-- оформления. Идемпотентно, повторный запуск безопасен.
-- ============================================================

update crm.settings
set hero_theme = null
where hero_theme = 'ocean';

update crm.settings
set hero_pattern = null
where hero_pattern in ('star', 'trellis');

-- ### 048_reprice_building_units.sql

-- ============================================================
-- 048: смена цены за 1 м² здания пересчитывает квартиры.
--
-- ЧТО БЫЛО НЕ ТАК. buildings.price_per_sqm участвовал ровно в одном месте —
-- в конструкторе этажей, когда квартиры ТОЛЬКО создаются: там один раз
-- считалось objects.price = area * price_per_sqm и записывалось в квартиру.
-- Дальше связи не было никакой. Админ менял цену за метр в карточке здания,
-- в базе менялось одно число в одной строке — и всё. Шахматка показывает
-- objects.price каждой квартиры, поэтому она честно показывала старые
-- суммы: их никто не пересчитывал.
--
-- ПОЧЕМУ ИМЕННО ФУНКЦИЯ В БАЗЕ. Это уже пробовали сделать из программы
-- (коммит 65fbb56, откачен коммитом 1b16dd2: собиралось без ошибок, но на
-- живом сайте не срабатывало, причину тогда не нашли). Тот вариант слал
-- обычные REST-запросы вида PATCH objects?id=in.(...), перечисляя id
-- квартир прямо в адресе — по ~37 символов на каждую, до 100 штук в
-- запросе. Это адрес длиной под 4 КБ, а шлюзы (Vercel, Cloudflare) режут
-- такие адреса. Отсюда и «собирается, но ничего не меняет».
--
-- Здесь никакого списка id нет вообще: один UPDATE внутри базы, отбор по
-- building_id. Длина запроса не зависит от числа квартир, и выполняется он
-- либо целиком, либо никак.
--
-- ЧТО НЕ ТРОГАЕТСЯ:
--   * проданные (status = 'sold') — цена продажи зафиксирована сделкой;
--   * квартиры без площади — считать не из чего (area * ставка = NULL);
--   * квартиры в долларах — ставка в карточке здания указана в сомони
--     (так и написано на самом поле), умножать на неё цену в USD нельзя.
--   Каждая такая группа возвращается отдельным счётчиком, чтобы программа
--   сказала о них вслух, а не молча пропустила.
--
-- ДОГОВОРЫ НЕ ЗАТРАГИВАЮТСЯ. У contracts своя сумма (contracts.amount), она
-- живёт отдельно от objects.price. Пересчёт цены забронированной квартиры
-- НЕ переписывает сумму уже подписанного договора.
--
-- ПРАВА. SECURITY INVOKER (по умолчанию) — намеренно. Политика
-- objects_update разрешает не-админу менять только свободные квартиры
-- (status = 'available'), и через эту функцию это ограничение остаётся в
-- силе: строки, на которые у вызывающего нет прав, просто не попадут в
-- UPDATE. SECURITY DEFINER здесь дал бы любому сотруднику право
-- переоценить забронированные квартиры чужого дома.
--
-- Идемпотентно, повторный запуск безопасен.
-- ============================================================

-- Тип результата может меняться при доработках, а PostgreSQL не разрешает
-- менять его через create or replace — поэтому сначала снимаем старую.
drop function if exists crm.reprice_building_units(uuid, numeric);

create function crm.reprice_building_units(
  p_building_id uuid,
  p_price_per_sqm numeric
)
returns table (
  repriced integer,
  skipped_sold integer,
  skipped_no_area integer,
  skipped_currency integer
)
language plpgsql
as $$
declare
  v_repriced integer;
begin
  if p_price_per_sqm is null or p_price_per_sqm <= 0 then
    raise exception 'Цена за 1 м² должна быть больше нуля';
  end if;

  with updated as (
    update crm.objects
    set price = round(area * p_price_per_sqm, 2)
    where building_id = p_building_id
      and status <> 'sold'
      and currency = 'TJS'
      and area is not null
      and area > 0
    returning 1
  )
  select count(*)::integer into v_repriced from updated;

  return query
  select
    v_repriced,
    (
      select count(*)::integer
      from crm.objects
      where building_id = p_building_id
        and status = 'sold'
    ),
    (
      select count(*)::integer
      from crm.objects
      where building_id = p_building_id
        and status <> 'sold'
        and currency = 'TJS'
        and (area is null or area <= 0)
    ),
    (
      select count(*)::integer
      from crm.objects
      where building_id = p_building_id
        and status <> 'sold'
        and currency <> 'TJS'
    );
end;
$$;

grant execute on function crm.reprice_building_units(uuid, numeric) to authenticated;

-- ### 049_potential_counts_unsold.sql

-- ============================================================
-- 049: «Потенциал непроданных» считает непроданные, а не только свободные.
--
-- ЧТО БЫЛО НЕ ТАК. Карточка называется «Потенциал непроданных», а сумма под
-- ней бралась по фильтру status = 'available' — то есть только по СВОБОДНЫМ.
-- Забронированные и «в работе» давали ровно ноль, хотя ни одна из них не
-- продана. Отсюда и ощущение неверного числа: подпись обещает одно, а
-- арифметика считает другое. Старый вариант подписи это признавал открыто —
-- там было написано «по N СВОБОДНЫМ квартирам».
--
-- Напоминание, почему «забронирована» здесь означает «денег ещё не было»:
-- recompute_object_status ставит 'sold', как только по договору прошёл хоть
-- один платёж (paid_amount > 0), и 'reserved' — пока не прошёл ни одного.
-- Значит забронированная квартира — это ещё не выручка, и её место именно в
-- потенциале.
--
-- ЧТО МЕНЯЕТСЯ. Ровно четыре фильтра внутри obj_stats: сумма в сомони, сумма
-- в долларах, счётчик квартир с ценой и счётчик квартир без цены. Везде
-- status = 'available' заменено на status <> 'sold'. Всё остальное в функции
-- не тронуто, включая счётчики статусов и площади.
--
-- Из непроданных исключается только продано. Статус 'rented' формально тоже
-- останется в сумме, но в этой базе его никто не ставит: автоматика знает
-- только available / reserved / sold.
--
-- Число на дашборде после этого ВЫРАСТЕТ — это ожидаемо, в него войдёт вся
-- непроданная площадь, а не одна свободная.
--
-- Идемпотентно, повторный запуск безопасен.
-- ============================================================

create or replace function crm.dashboard_summary(
  p_building_id uuid default null,
  p_from date default null,
  p_to date default null
)
returns jsonb
language sql
stable
security invoker
set search_path = crm, public
as $$
with
scoped_objects as (
  select o.id, o.status, o.building_id, o.price, o.currency, o.area
  from crm.objects o
  left join crm.buildings b on b.id = o.building_id
  where case
          when p_building_id is not null then o.building_id = p_building_id
          else coalesce(b.construction_status, 'in_progress') <> 'completed'
        end
),
scoped_contracts as (
  select c.id, c.client_id, c.amount, c.paid_amount, c.currency,
         c.signed_date, c.status, so.building_id
  from crm.contracts c
  join scoped_objects so on so.id = c.object_id
),
live_contracts as (
  select *
  from scoped_contracts
  where status <> 'cancelled'
    and (p_from is null or (signed_date is not null and signed_date >= p_from))
    and (p_to   is null or (signed_date is not null and signed_date <= p_to))
),
rel_buildings as (
  select b.id, b.name
  from crm.buildings b
  where case
          when p_building_id is not null then b.id = p_building_id
          else b.construction_status <> 'completed'
        end
),
obj_stats as (
  select
    (count(*))::int                                             as total,
    (count(*) filter (where status = 'available'))::int         as available,
    (count(*) filter (where status = 'reserved'))::int          as reserved,
    (count(*) filter (where status = 'sold'))::int              as sold,
    (count(*) filter (where status = 'in_progress'))::int       as in_progress,
    coalesce(sum(area), 0)                                      as area_total,
    coalesce(sum(area) filter (where status = 'available'), 0)   as area_available,
    coalesce(sum(area) filter (where status = 'reserved'), 0)    as area_reserved,
    coalesce(sum(area) filter (where status = 'sold'), 0)        as area_sold,
    coalesce(sum(area) filter (where status = 'rented'), 0)      as area_rented,
    coalesce(sum(area) filter (where status = 'in_progress'), 0) as area_in_progress,
    coalesce(sum(price) filter (where status <> 'sold' and currency <> 'USD'), 0) as pot_tjs,
    coalesce(sum(price) filter (where status <> 'sold' and currency  = 'USD'), 0) as pot_usd,
    (count(*) filter (where status <> 'sold' and price is not null and price > 0))::int
      as pot_units,
    (count(*) filter (where status <> 'sold' and (price is null or price = 0)))::int
      as pot_no_price
  from scoped_objects
),
money as (
  select
    coalesce(sum(paid_amount) filter (where currency <> 'USD'), 0) as paid_tjs,
    coalesce(sum(paid_amount) filter (where currency  = 'USD'), 0) as paid_usd,
    coalesce(sum(greatest(amount - paid_amount, 0)) filter (where currency <> 'USD'), 0) as debt_tjs,
    coalesce(sum(greatest(amount - paid_amount, 0)) filter (where currency  = 'USD'), 0) as debt_usd
  from live_contracts
),
overdue as (
  select
    coalesce(sum(oi.unpaid_amount) filter (where c.currency <> 'USD'), 0) as tjs,
    coalesce(sum(oi.unpaid_amount) filter (where c.currency  = 'USD'), 0) as usd,
    (count(distinct c.id))::int                                          as contracts
  from crm.overdue_installments oi
  join scoped_contracts c on c.id = oi.contract_id
  where oi.due_date < current_date
    and oi.unpaid_amount > 0.005
    and c.status <> 'cancelled'
),
-- The end of the window: the last month that actually has a signing, so the
-- chart lands where the data is even if the newest contract is not this month.
month_end as (
  select coalesce(
           date_trunc('month', max(signed_date)),
           date_trunc('month', current_date)
         ) as m
  from scoped_contracts
  where status <> 'cancelled' and signed_date is not null
),
-- Six consecutive calendar months. A month with no sales must be a zero on the
-- axis, not a missing point.
month_axis as (
  select to_char(g, 'YYYY-MM') as month
  from month_end me,
       generate_series(me.m - interval '5 months', me.m, interval '1 month') as g
),
month_rev as (
  select
    ax.month,
    coalesce(sum(c.amount) filter (where c.currency <> 'USD'), 0) as tjs,
    coalesce(sum(c.amount) filter (where c.currency  = 'USD'), 0) as usd
  from month_axis ax
  left join scoped_contracts c
         on c.status <> 'cancelled'
        and c.signed_date is not null
        and to_char(c.signed_date, 'YYYY-MM') = ax.month
  group by ax.month
  order by ax.month
),
-- Same treatment for the daily chart: every day in the chosen period appears,
-- including the ones with no money received.
day_axis as (
  select g::date as day
  from generate_series(
         coalesce(p_from, current_date),
         coalesce(p_to, current_date),
         interval '1 day'
       ) as g
  where p_from is not null and p_to is not null
),
day_rev as (
  select
    ax.day,
    coalesce(sum(p.amount) filter (where c.currency <> 'USD'), 0) as tjs,
    coalesce(sum(p.amount) filter (where c.currency  = 'USD'), 0) as usd
  from day_axis ax
  left join crm.contract_payments p
         on p.paid and p.paid_date = ax.day
  left join scoped_contracts c on c.id = p.contract_id
  group by ax.day
  order by ax.day
),
occ as (
  select
    rb.id, rb.name,
    (count(*))::int                                          as total,
    (count(*) filter (where so.status = 'available'))::int    as available,
    (count(*) filter (where so.status = 'reserved'))::int     as reserved,
    (count(*) filter (where so.status = 'sold'))::int         as sold,
    (count(*) filter (where so.status = 'rented'))::int       as rented,
    (count(*) filter (where so.status = 'in_progress'))::int  as in_progress
  from rel_buildings rb
  join scoped_objects so on so.building_id = rb.id
  group by rb.id, rb.name
),
bld_rev as (
  select
    rb.id, rb.name,
    coalesce(sum(lc.amount) filter (where lc.currency <> 'USD'), 0) as tjs,
    coalesce(sum(lc.amount) filter (where lc.currency  = 'USD'), 0) as usd
  from rel_buildings rb
  join live_contracts lc on lc.building_id = rb.id
  group by rb.id, rb.name
),
debtors as (
  select
    lc.client_id,
    cl.name,
    lc.currency::text                       as currency,
    sum(lc.amount - lc.paid_amount)         as remaining
  from live_contracts lc
  join crm.clients cl on cl.id = lc.client_id
  where lc.amount - lc.paid_amount > 0
  group by 1, 2, 3
  order by 4 desc
  limit 5
),
completed as (
  select
    (select count(*) from crm.buildings where construction_status = 'completed')::int as buildings,
    (select count(*)
       from crm.objects o
       join crm.buildings b on b.id = o.building_id
      where b.construction_status = 'completed')::int as units
)
select jsonb_build_object(
  'counts', (
    select jsonb_build_object(
      'total', total, 'available', available, 'reserved', reserved,
      'sold', sold, 'in_progress', in_progress
    ) from obj_stats
  ),
  'area', (select jsonb_build_object('total', area_total, 'available', area_available) from obj_stats),
  'area_split', (
    select jsonb_build_object(
      'sold', area_sold, 'reserved', area_reserved, 'available', area_available,
      'rented', area_rented, 'in_progress', area_in_progress
    ) from obj_stats
  ),
  'potential', (select jsonb_build_object('tjs', pot_tjs, 'usd', pot_usd) from obj_stats),
  'potential_units', (select pot_units from obj_stats),
  'potential_no_price', (select pot_no_price from obj_stats),
  'paid', (select jsonb_build_object('tjs', paid_tjs, 'usd', paid_usd) from money),
  'debt', (select jsonb_build_object('tjs', debt_tjs, 'usd', debt_usd) from money),
  'overdue', (select jsonb_build_object('tjs', tjs, 'usd', usd) from overdue),
  'overdue_contracts', (select contracts from overdue),
  'revenue_months', coalesce((
    select jsonb_agg(jsonb_build_object('month', month, 'tjs', tjs, 'usd', usd) order by month)
    from month_rev
  ), '[]'::jsonb),
  'revenue_days', coalesce((
    select jsonb_agg(jsonb_build_object('day', day, 'tjs', tjs, 'usd', usd) order by day)
    from day_rev
  ), '[]'::jsonb),
  'occupancy', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', id, 'name', name, 'total', total,
      'available', available, 'reserved', reserved, 'sold', sold,
      'rented', rented, 'in_progress', in_progress
    ) order by name)
    from occ
  ), '[]'::jsonb),
  'revenue_by_building', coalesce((
    select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'tjs', tjs, 'usd', usd)
                     order by (tjs + usd) desc)
    from bld_rev where tjs > 0 or usd > 0
  ), '[]'::jsonb),
  'top_debtors', coalesce((
    select jsonb_agg(jsonb_build_object(
      'client_id', client_id, 'name', name, 'currency', currency, 'remaining', remaining
    ) order by remaining desc)
    from debtors
  ), '[]'::jsonb),
  'completed', (select jsonb_build_object('buildings', buildings, 'units', units) from completed)
);
$$;

grant execute on function crm.dashboard_summary(uuid, date, date) to authenticated;

-- ### 050_building_rate_is_automatic.sql

-- ============================================================
-- 050: цена за 1 м² доходит до квартир САМА, без кнопок.
--
-- ЧТО БЫЛО НЕ ТАК. Цена квартиры — хранимое число, и записывалось оно ровно
-- один раз: в конструкторе этажей, в момент создания квартиры. Всё
-- остальное время связи со ставкой здания не было. Мы её чинили дважды —
-- сперва из браузера (65fbb56, откачено), потом функцией в базе (048) — и
-- оба раза пересчёт запускался ТОЛЬКО когда человек менял ставку и
-- соглашался в диалоге. Достаточно было:
--   * забыть нажать,
--   * сохранить ту же ставку (изменения нет — пересчёта нет),
--   * создать квартиру позже, когда ставка уже стояла,
--   * вписать площадь позже, чем ставку,
-- и квартира навсегда оставалась без цены. Дашборд честно суммирует
-- objects.price, поэтому такие квартиры давали ноль, а карточка «Потенциал
-- непроданных» показывала сумму по половине дома.
--
-- ЗДЕСЬ ПОДХОД ДРУГОЙ. Связь «цена квартиры = её площадь × ставка здания»
-- перестаёт быть разовым действием и становится правилом базы. Три
-- триггера закрывают три момента, когда цена может разойтись:
--
--   1. изменили ставку здания   -> пересчитались непроданные квартиры;
--   2. создали квартиру         -> цена посчиталась сразу;
--   3. вписали площадь позже    -> цена посчиталась сразу.
--
-- Нажимать больше ничего не нужно. Кнопка «Применить» остаётся — она нужна
-- для квартир, созданных ДО этой миграции.
--
-- ЧТО НЕ ТРОГАЕТСЯ (везде одинаково):
--   * проданные (status = 'sold') — цена зафиксирована сделкой;
--   * квартиры без площади — умножать не на что;
--   * квартиры в долларах — ставка здания указана в сомони.
--
-- ДОГОВОРЫ НЕ ЗАТРАГИВАЮТСЯ: у contracts своя сумма (contracts.amount), она
-- хранится отдельно от objects.price.
--
-- ОЧИСТКА СТАВКИ НЕ СТИРАЕТ ЦЕНЫ. Если price_per_sqm стал NULL, триггер
-- ничего не делает: снять цены можно только осознанно, из карточки здания,
-- с отдельным подтверждением. Иначе случайно очищенное поле молча обнулило
-- бы прайс всего дома.
--
-- ПРАВА: SECURITY DEFINER — намеренно, и это отличается от функции 048.
-- Там пересчёт был действием пользователя, и политика objects_update
-- (не-админ меняет только свободные квартиры) должна была его ограничивать.
-- Здесь это не действие, а инвариант данных: если ставка здания изменилась,
-- цены обязаны сойтись целиком, а не на тех строках, до которых дотянулись
-- права. Само право менять ставку по-прежнему проверяется на buildings.
--
-- Идемпотентно, повторный запуск безопасен.
-- ============================================================

-- ---------- 1. ставка здания изменилась ----------

create or replace function crm.apply_building_rate()
returns trigger
language plpgsql
security definer
set search_path = crm, public
as $$
begin
  -- NULL — это «ставка не задана», а не «обнулить прайс». См. шапку файла.
  if new.price_per_sqm is null or new.price_per_sqm <= 0 then
    return new;
  end if;

  update crm.objects
  set price = round(area * new.price_per_sqm, 2)
  where building_id = new.id
    and status <> 'sold'
    and currency = 'TJS'
    and area is not null
    and area > 0
    -- Не трогаем строки, которые уже стоят на этой цене: лишний UPDATE
    -- дёргает триггер updated_at и заставляет базу писать зря.
    and price is distinct from round(area * new.price_per_sqm, 2);

  return new;
end;
$$;

drop trigger if exists trg_apply_building_rate on crm.buildings;
create trigger trg_apply_building_rate
  after update of price_per_sqm on crm.buildings
  for each row
  when (new.price_per_sqm is distinct from old.price_per_sqm)
  execute function crm.apply_building_rate();

-- ---------- 2. и 3. квартира создана / у неё появилась площадь ----------

create or replace function crm.price_unit_from_building()
returns trigger
language plpgsql
security definer
set search_path = crm, public
as $$
declare
  v_rate numeric;
begin
  if new.building_id is null
     or new.status = 'sold'
     or new.currency <> 'TJS'
     or new.area is null
     or new.area <= 0
  then
    return new;
  end if;

  -- Цену, введённую руками, не перебиваем: ставка здания — значение по
  -- умолчанию, а не запрет назначить квартире свою цену.
  if new.price is not null and new.price > 0 then
    return new;
  end if;

  select b.price_per_sqm into v_rate
  from crm.buildings b
  where b.id = new.building_id;

  if v_rate is null or v_rate <= 0 then
    return new;
  end if;

  new.price := round(new.area * v_rate, 2);
  return new;
end;
$$;

drop trigger if exists trg_price_unit_from_building on crm.objects;
create trigger trg_price_unit_from_building
  before insert or update of area, building_id on crm.objects
  for each row
  execute function crm.price_unit_from_building();

-- ---------- разовая сверка существующих данных ----------
--
-- Всё, что накопилось до этой миграции: квартиры, у которых есть площадь и
-- есть ставка здания, но цены нет. Ровно те 178 строк, из-за которых
-- «Потенциал непроданных» считал половину. Дальше за этим следят триггеры.

update crm.objects o
set price = round(o.area * b.price_per_sqm, 2)
from crm.buildings b
where b.id = o.building_id
  and o.status <> 'sold'
  and o.currency = 'TJS'
  and o.area is not null
  and o.area > 0
  and (o.price is null or o.price = 0)
  and b.price_per_sqm is not null
  and b.price_per_sqm > 0;
-- ############################################################
-- ### 051_sales_by_manager_building_filter.sql
-- ############################################################

-- ЗАЧЕМ. В шапке дашборда есть выбор ЖК, и ему подчиняется каждая цифра на
-- странице — кроме таблицы «Продажи по менеджерам». Она звала
-- sales_by_manager(p_from, p_to): дат достаточно, а ЖК передать некуда.
-- Получалось, что при выбранном одном ЖК верх страницы показывает его, а
-- таблица менеджеров — по-прежнему все объекты. Две половины одного экрана
-- отвечали на разные вопросы, и цифры под ними не сходились.
--
-- Функция получает третий параметр. Старая двухпараметрная версия удаляется, а
-- не остаётся рядом: оставить её — значит оставить и способ позвать таблицу
-- без фильтра.
--
-- Соединение с objects внутреннее, и это безопасно: contracts.object_id
-- объявлен NOT NULL с внешним ключом, так что ни одна строка на нём не
-- потеряется.
--
-- Идемпотентно: drop … if exists перед create, повторный запуск безопасен.
-- ============================================================

drop function if exists crm.sales_by_manager(date, date);

create or replace function crm.sales_by_manager(
  p_from date default null,
  p_to date default null,
  p_building_id uuid default null
)
returns table (
  manager text,
  currency text,
  contracts bigint,
  total numeric,
  paid numeric
)
language plpgsql
security definer
set search_path = crm, public, auth
stable
as $$
begin
  if not (crm.is_admin() or crm.is_director()) then
    raise exception 'Доступно только администратору и директору';
  end if;
  return query
    select
      coalesce(u.email::text, 'Без менеджера') as manager,
      c.currency::text as currency,
      count(*)::bigint as contracts,
      sum(c.amount) as total,
      sum(least(c.paid_amount, c.amount)) as paid
    from crm.contracts c
    join crm.objects o on o.id = c.object_id
    left join auth.users u on u.id = c.created_by
    where c.status <> 'cancelled'
      and (p_from is null or c.signed_date >= p_from)
      and (p_to is null or c.signed_date <= p_to)
      and (p_building_id is null or o.building_id = p_building_id)
    group by 1, 2
    order by 4 desc nulls last;
end;
$$;

grant execute on function crm.sales_by_manager(date, date, uuid) to authenticated;
-- ### 052_sms_provider_label.sql

-- ============================================================
-- 052: поле «Провайдер SMS» становится обычной надписью, а не жёстко
-- вшитым текстом на экране.
--
-- ЧТО БЫЛО. Страница настроек рисовала для «Провайдера» readonly-поле со
-- значением "Payom.tj" прямо в разметке (src/app/(app)/settings/page.tsx) —
-- в базе для этого не было ни колонки, ни смысла её сохранять, потому что
-- сохранять было нечего: значение никогда не менялось.
--
-- ЧТО МЕНЯЕТСЯ. Появляется обычная колонка, обычное поле ввода, обычное
-- сохранение — как у имени отправителя и API-ключа.
--
-- ЧЕСТНОЕ ОГРАНИЧЕНИЕ, О КОТОРОМ НАДО ПОМНИТЬ. В коде реализован ЗАПРОС
-- ИМЕННО К ШЛЮЗУ PAYOM.TJ (gateway.payom.tj, формат тела запроса и
-- авторизации — его собственный, см. src/lib/sms/sendPaymentReminders.ts).
-- Это поле — подпись для админа, а не переключатель шлюза: вписать сюда
-- название другого провайдера не заставит бэкенд слать запросы туда же.
-- Подключить второй шлюз — отдельная задача, для неё нужен его API.
-- ============================================================

alter table crm.settings
  add column if not exists sms_provider text not null default 'Payom.tj';

-- ### 053_audit_log_context.sql

-- ============================================================
-- 053: журнал событий помнит, В КАКОМ договоре/квартире/клиенте произошло
-- событие, а не только голый UUID и список изменённых полей.
--
-- ЧТО БЫЛО НЕ ТАК. crm.log_change()/crm.log_delete() писали:
--   * insert/delete -- всю строку целиком (to_jsonb);
--   * update        -- только изменившиеся поля, {поле: {old, new}}.
-- Для клиента этого достаточно: у строки уже есть name. Но для платежа
-- (contract_payments) и договора (contracts) собственного человекочитаемого
-- имени нет — только client_id/object_id/contract_id, голые UUID. Запись
-- «Пардохт · 16516.66» ничего не говорит, в счёт какого договора, какой
-- квартиры и какого клиента это было. Экран журнала показывал именно это.
--
-- Второй, отдельный баг был на фронтенде: страница журнала ищет
-- details.changed, а триггер никогда не клал diff под ключ "changed" — он
-- И ЕСТЬ details. Поэтому у каждой строки «Тагйирдихӣ» в колонке
-- «Тафсилот» всегда стоял прочерк, даже когда изменения были. Правится в
-- src/app/(app)/settings/audit-log/page.tsx отдельным коммитом.
--
-- ЧТО МЕНЯЕТСЯ. Новая функция crm.audit_context(entity_type, id) одним
-- запросом на нужный тип сущности достаёт то, что относится к делу: имя
-- клиента, номер договора, имя/квартиру объекта, здание, валюту договора.
-- Кладётся в details под ключ "_context" — с подчёркиванием, чтобы никогда
-- не столкнуться с настоящим именем колонки. jsonb_strip_nulls убирает
-- то, что для этого типа сущности не имеет смысла (у клиента нет номера
-- договора), так что фронтенду достаточно проверить, какие ключи вообще
-- пришли.
--
-- ПОЧЕМУ ОДНА ФУНКЦИЯ ПО ID, А НЕ ПО СТРОКЕ NEW/OLD. Она вызывается и из
-- log_change (после INSERT/UPDATE, строка уже видна), и из log_delete
-- (BEFORE DELETE, строка ещё жива) — но она не трогает удаляемую/меняемую
-- строку напрямую, а ищет её заново по id и достраивает связи (платёж →
-- договор → клиент/квартира → здание). Так один код работает в обоих
-- триггерах без дублирования.
--
-- Идемпотентно, повторный запуск безопасен.
-- ============================================================

create or replace function crm.audit_context(p_entity_type text, p_entity_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = crm, public
as $$
declare
  v_client_name text;
  v_contract_number text;
  v_object_name text;
  v_building_name text;
  v_currency crm.currency;
begin
  if p_entity_type = 'client' then
    select c.name into v_client_name
    from crm.clients c
    where c.id = p_entity_id;

  elsif p_entity_type = 'contract' then
    select cl.name, c.number, o.name, b.name, c.currency
      into v_client_name, v_contract_number, v_object_name, v_building_name, v_currency
    from crm.contracts c
    left join crm.clients cl on cl.id = c.client_id
    left join crm.objects o on o.id = c.object_id
    left join crm.buildings b on b.id = o.building_id
    where c.id = p_entity_id;

  elsif p_entity_type = 'contract_payment' then
    select cl.name, c.number, o.name, b.name, c.currency
      into v_client_name, v_contract_number, v_object_name, v_building_name, v_currency
    from crm.contract_payments p
    join crm.contracts c on c.id = p.contract_id
    left join crm.clients cl on cl.id = c.client_id
    left join crm.objects o on o.id = c.object_id
    left join crm.buildings b on b.id = o.building_id
    where p.id = p_entity_id;

  elsif p_entity_type = 'object' then
    select o.name, b.name into v_object_name, v_building_name
    from crm.objects o
    left join crm.buildings b on b.id = o.building_id
    where o.id = p_entity_id;
  end if;

  return jsonb_strip_nulls(jsonb_build_object(
    'client_name', v_client_name,
    'contract_number', v_contract_number,
    'object_name', v_object_name,
    'building_name', v_building_name,
    'currency', v_currency
  ));
end;
$$;

create or replace function crm.log_change()
returns trigger
language plpgsql
security definer
set search_path = crm, public
as $$
declare
  v_diff jsonb;
  v_context jsonb;
begin
  -- Служебный пересчёт (график платежей) выключает журнал построчно и пишет
  -- одну сводную запись -- см. regenerate_schedule().
  if current_setting('crm.audit_off', true) = 'on' then
    return NEW;
  end if;
  v_context := crm.audit_context(TG_ARGV[0], NEW.id);

  if TG_OP = 'INSERT' then
    insert into crm.audit_log (actor_id, action, entity_type, entity_id, details)
    values (
      auth.uid(), 'create', TG_ARGV[0], NEW.id,
      to_jsonb(NEW) || jsonb_build_object('_context', v_context)
    );
    return NEW;
  end if;

  -- UPDATE: only the fields that actually changed, old -> new, so the log
  -- reads as "what happened" instead of two full row dumps.
  select coalesce(
    jsonb_object_agg(n.key, jsonb_build_object('old', o.value, 'new', n.value)),
    '{}'::jsonb
  )
  into v_diff
  from jsonb_each(to_jsonb(NEW)) n
  join jsonb_each(to_jsonb(OLD)) o using (key)
  where n.value is distinct from o.value
    and n.key not in ('updated_at');

  if v_diff <> '{}'::jsonb then
    insert into crm.audit_log (actor_id, action, entity_type, entity_id, details)
    values (
      auth.uid(), 'update', TG_ARGV[0], NEW.id,
      v_diff || jsonb_build_object('_context', v_context)
    );
  end if;
  return NEW;
end;
$$;

create or replace function crm.log_delete()
returns trigger
language plpgsql
security definer
set search_path = crm, public
as $$
declare
  v_context jsonb;
begin
  if current_setting('crm.audit_off', true) = 'on' then
    return OLD;
  end if;
  -- BEFORE DELETE: OLD still exists, and so does everything audit_context
  -- looks up through it (only OLD itself is about to go away).
  v_context := crm.audit_context(TG_ARGV[0], OLD.id);
  insert into crm.audit_log (actor_id, action, entity_type, entity_id, details)
  values (
    auth.uid(), 'delete', TG_ARGV[0], OLD.id,
    to_jsonb(OLD) || jsonb_build_object('_context', v_context)
  );
  return OLD;
end;
$$;

-- ### 054_service_role_schema_grants.sql

-- ============================================================
-- 054: сервисному ключу дали права на схему crm. Наконец настоящая причина
-- «permission denied for schema crm» / «Invalid API key» у SMS-рассылки.
--
-- ЧТО БЫЛО НЕ ТАК. Схема crm и все её таблицы выдавались правами трижды по
-- ходу файла (при создании, потом ещё дважды) — и каждый раз одной и той же
-- строкой:
--
--   grant usage on schema crm to anon, authenticated;
--   grant all on all tables in schema crm to anon, authenticated;
--   grant all on all sequences in schema crm to anon, authenticated;
--   alter default privileges in schema crm grant all on tables to anon, authenticated;
--
-- Ни разу — ни одного упоминания service_role. Обычный вход в программу
-- работает через anon/authenticated, поэтому сайт был в полном порядке.
-- А /api/sms/*, /api/cron/* подключаются SUPABASE_SERVICE_ROLE_KEY — это
-- РОЛЬ В БАЗЕ ПОСТГРЕС с именем service_role, и у неё не было даже права
-- заглянуть в схему crm, не то что читать settings. Отсюда и ошибка: ключ
-- настоящий, из правильного проекта — но роль, которую он представляет,
-- никогда не получала доступа.
--
-- Раньше эта ошибка была подписана «скорее всего ключ из другого проекта»
-- (см. adminErrorMessage в serviceClient.ts) — и это было ПРАВДОПОДОБНОЕ,
-- но не то объяснение: причина была здесь, в базе, а не в Vercel.
--
-- ЧТО ДЕЛАЕТ ЭТОТ ФАЙЛ. Даёт service_role ровно то же самое, что уже есть
-- у authenticated: доступ к схеме, ко всем существующим таблицам и
-- последовательностям, право выполнять функции, и правило на будущее —
-- новая таблица/функция появится уже с этим правом, без ручной правки.
--
-- ПОЧЕМУ ЭТО БЕЗОПАСНО. service_role и так проходит мимо RLS по конструкции
-- Supabase (это и есть смысл «служебной» роли) — у него уже есть полный
-- доступ к данным на уровне движка. Явные grant здесь не открывают ничего
-- нового, они лишь снимают отдельный, более ранний барьер Постгреса
-- (владение схемой/объектом), который стоял ПЕРЕД проверкой RLS и обрубал
-- запрос до неё.
--
-- Идемпотентно, повторный запуск безопасен.
-- ============================================================

grant usage on schema crm to service_role;
grant all on all tables in schema crm to service_role;
grant all on all sequences in schema crm to service_role;
grant execute on all functions in schema crm to service_role;

alter default privileges in schema crm grant all on tables to service_role;
alter default privileges in schema crm grant all on sequences to service_role;
alter default privileges in schema crm grant execute on functions to service_role;

-- ### 055_auto_regenerate_schedule.sql

-- ============================================================
-- 055: смена суммы договора сама пересчитывает неоплаченный график.
--
-- ЧТО БЫЛО НЕ ТАК (048/предыдущий фикс). Функция crm.regenerate_schedule
-- уже умела ровно то, что нужно: удалить неоплаченные строки графика и
-- пересобрать их от текущего остатка (сумма − оплачено), поровну на
-- installment_months. Но её никто и ниоткуда не вызывал — правку суммы
-- договора (скидка, исправление) форма писала только в crm.contracts,
-- сам график в crm.contract_payments оставался от старой суммы. Мы дали
-- администратору кнопку «Пересчитать график» — но это по-прежнему ручное
-- действие: забыл нажать — и печатный договор снова врёт про остаток.
--
-- ЧТО МЕНЯЕТСЯ. Триггер на crm.contracts: если у ДОГОВОРА С РАССРОЧКОЙ
-- изменилась сумма и есть хоть одна неоплаченная строка графика —
-- график пересобирается сам, в том же самом запросе, без отдельного шага.
--
-- КОГДА ТРИГГЕР НЕ СРАБАТЫВАЕТ (и это осознанно):
--   * payment_type <> 'installment' — у разовой оплаты и бартера нет
--     графика, который можно было бы пересчитать;
--   * installment_months не задан — распределять остаток не на сколько
--     месяцев, взять неоткуда;
--   * сумма не менялась — правка телефона клиента через ту же форму не
--     должна пересобирать и так верный график;
--   * неоплаченных строк нет вовсе — то есть график либо ещё не создан
--     (создаётся отдельной кнопкой «Сгенерировать график»), либо уже
--     полностью погашен, пересобирать нечего;
--   * новая сумма не больше уже оплаченного (NEW.amount <= NEW.paid_amount).
--     Сама regenerate_schedule в этом случае бросает исключение «Nothing
--     left to schedule» — и поскольку триггер выполняется ПОСЛЕ обновления
--     договора, это исключение откатило бы всё сохранение целиком, включая
--     саму правку суммы. Такую сумму (меньше уже полученных денег) просто
--     не с чем распределять по месяцам — расхождение при этом останется на
--     виду через баннер и кнопку «Пересчитать график» на карточке, а не
--     будет спрятано отменённым сохранением.
--
-- Оплаченные строки (receipts) триггер не трогает — это делает сама
-- regenerate_schedule (`where ... and paid = false`).
--
-- КНОПКА «ПЕРЕСЧИТАТЬ ГРАФИК» ОСТАЁТСЯ. Она нужна для договоров, у которых
-- расхождение УЖЕ есть, накопленное до этого триггера — сам триггер видит
-- только новые изменения суммы, а не чинит задним числом то, что случилось
-- раньше него.
--
-- Идемпотентно, повторный запуск безопасен.
-- ============================================================

create or replace function crm.auto_regenerate_schedule()
returns trigger
language plpgsql
security definer
set search_path = crm, public
as $$
begin
  if NEW.payment_type = 'installment'
     and NEW.installment_months is not null
     and NEW.installment_months > 0
     and NEW.amount is distinct from OLD.amount
     and NEW.amount > NEW.paid_amount
     and exists (
       select 1 from crm.contract_payments
       where contract_id = NEW.id and paid = false
     )
  then
    perform crm.regenerate_schedule(NEW.id, NEW.installment_months);
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_auto_regenerate_schedule on crm.contracts;
create trigger trg_auto_regenerate_schedule
after update of amount on crm.contracts
for each row execute function crm.auto_regenerate_schedule();

-- ### 056_backfill_drifted_schedules.sql

-- ============================================================
-- 056: разовая чистка всех договоров, у которых график уже разошёлся с
-- суммой ДО того, как появился автоматический триггер (055).
--
-- ПОЧЕМУ ОТДЕЛЬНЫЙ ФАЙЛ, А НЕ КНОПКА «ПЕРЕСЧИТАТЬ ГРАФИК» НА КАЖДОМ
-- ДОГОВОРЕ. Триггер 055 видит только НОВЫЕ изменения суммы — тем
-- договорам, у которых расхождение накопилось раньше (сумму меняли до
-- того, как триггер появился), он ничем не помогает: пересчитывать их
-- задним числом руками, открывая каждый по одному, при десятках и сотнях
-- договоров — не работа для человека, а работа для одного запроса.
--
-- ПОЧЕМУ НЕ ВЫЗЫВАЕТСЯ crm.regenerate_schedule() НАПРЯМУЮ. Эта функция
-- сама проверяет право на запись (crm.can_write()) через auth.uid() —
-- правильно для действия из программы, где есть авторизованный
-- пользователь. Но в SQL Editor запрос выполняется без такой сессии,
-- auth.uid() там пустой, my_role() падает на 'none', can_write() — false,
-- и вызов regenerate_schedule закончился бы «Read-only role». Поэтому
-- здесь та же самая арифметика (переписана из regenerate_schedule один в
-- один) выполняется прямыми командами, без проверки роли — сам факт того,
-- что администратор запускает файл в SQL Editor, уже и есть разрешение.
--
-- КОГО ТРОГАЕТ. Только договоры с рассрочкой, у которых сумма ГРАФИКА
-- (оплачено + план) не совпадает с суммой ДОГОВОРА больше чем на 50 дирам/
-- центов, есть хоть одна неоплаченная строка и новую сумму есть на что
-- распределять (amount > paid_amount). Уже верные договоры не трогает
-- совсем — RAISE NOTICE в конце покажет, сколько именно исправлено.
--
-- Оплаченные платежи не удаляются и не пересоздаются никогда.
--
-- Идемпотентно: повторный запуск на уже исправленных договорах найдёт
-- ноль расхождений и ничего не сделает.
-- ============================================================

-- ############################################################
-- ЭТОТ БЛОК ОТКЛЮЧЁН (его код здесь больше не выполняется). НЕ ВОССТАНАВЛИВАТЬ.
--
-- Он «чинил» договоры, у которых сумма ВСЕХ строк (оплачено + план) не равна
-- сумме договора. Но после любого платежа сверх первоначального взноса эта
-- сумма НЕ равна сумме договора по самому устройству графика: платёж ложится
-- отдельной строкой «оплачено», а строки плана остаются как были (покрытие
-- считается по очереди, см. блок 043). То есть блок считал «разошедшимся»
-- КАЖДЫЙ договор, по которому клиент хоть раз заплатил, -- и при КАЖДОМ запуске
-- этого файла стирал его график и создавал заново на весь срок от СЕГОДНЯ.
-- Результат: сроки уезжали в будущее, суммы платежей менялись, а клиенты,
-- которые просрочили, пропадали из «Должников». Поймано проверкой: график
-- после повторного запуска файла отличался от графика до него.
--
-- Настоящее расхождение (в графике не хватает денег до остатка) теперь ловит
-- интерфейс договора (блок 077), а сдвинутые этим блоком графики находит и
-- возвращает crm.schedule_shifts() / crm.restore_schedule() (там же, 077).
-- ############################################################


-- ### 058_due_today_sms_template.sql

-- ============================================================
-- 058: отдельный текст SMS для «сегодня день платежа», а не тот же текст,
-- что и для напоминания за N дней вперёд.
--
-- ЧТО БЫЛО НЕ ТАК. Рассылка платежей отправляет ДВА разных напоминания по
-- одному и тому же взносу: заранее (за sms_reminder_days дней) и в день
-- самого платежа — с отдельными отметками (reminder_sent_at /
-- due_reminder_sent_at), чтобы не задвоить. Но текст брался ОДИН и тот же
-- (settings.sms_payment_template) для обоих случаев — разница была только
-- в том, какая дата подставлялась в {{due_date}}. Для «за 3 дня» это
-- звучит нормально («…до 25.08.2026»), а для «сегодня» — «…до 21.08.2026»,
-- где 21.08.2026 и есть сегодняшняя дата: смысл верный, но сообщение не
-- говорит прямо «сегодня», а вместо этого повторяет число, которое клиент
-- и так видит в календаре телефона.
--
-- ЧТО МЕНЯЕТСЯ. Новая колонка sms_due_today_template — свой текст для
-- дня платежа, с теми же плейсхолдерами. Если админ его не заполнит,
-- используется дефолт ниже; если заполнит — со дня платежа рассылка сама
-- возьмёт именно его, шаблон за N дней вперёд она не трогает.
--
-- Идемпотентно, повторный запуск безопасен.
-- ============================================================

alter table crm.settings
  add column if not exists sms_due_today_template text;

update crm.settings
set sms_due_today_template = $tpl$Уважаемый(ая) {{client_name}}, напоминаем: сегодня срок оплаты {{amount}} {{currency}} по договору №{{contract_number}}.$tpl$
where sms_due_today_template is null;

-- ### 059_rental_units.sql

-- ============================================================
-- 059: новый вид сделки -- аренда.
--
-- Только это одно значение enum, ничего больше. ALTER TYPE ... ADD VALUE
-- нельзя использовать в той же транзакции, где новое значение потом
-- где-то СРАВНИВАЕТСЯ (в функции, ограничении и т.п.) -- Postgres прямо
-- запрещает "unsafe use of new value of enum type" в пределах одной
-- транзакции. Поэтому вся остальная работа (recompute_object_status,
-- новая колонка listing_type и т.д.) -- в 060 ниже, ПОСЛЕ явного commit --
-- не потому что это менее связанные изменения, а потому что весь этот
-- файл выполняется одним запросом (одной неявной транзакцией), и без
-- этого commit новое значение 'rent' было бы недоступно тем же функциям
-- чуть ниже, на первом же прогоне на базе, где его ещё нет.
--
-- Дальше по смыслу: сумма договора аренды -- это не цена объекта, а
-- арендная плата за весь срок (ставка × месяцев), а installment_months
-- значит срок аренды. Механика графика платежей та же, что у рассрочки
-- (см. 060) -- отдельного движка для повторяющихся платежей не нужно.
--
-- Идемпотентно, повторный запуск безопасен.
-- ============================================================

alter type crm.payment_type add value if not exists 'rent';

-- Обязательный явный commit -- см. пояснение выше. Безвреден и на
-- повторном прогоне, когда 'rent' уже существует и ничего нового не
-- добавлялось: просто фиксирует то, что уже сделано, и открывает
-- следующую неявную транзакцию для 060.
commit;

-- ### 060_rental_units_status.sql

-- ============================================================
-- 060: аренда -- остальное. Follows 059 (payment_type gained 'rent' there,
-- committed separately above -- see that block for why it had to be).
--
-- 1. crm.objects.listing_type ('sale' | 'rent', default 'sale' -- every
--    existing row keeps behaving exactly as before). This is what tells
--    a warehouse meant for rent apart from an apartment meant for sale
--    BEFORE either one has a contract at all -- the shakhmatka excludes
--    listing_type = 'rent' objects, the new "Аренда" section on the
--    building page shows only those.
--
-- 2. crm.recompute_object_status() now sets 'rented' (already a valid
--    status, already coloured/translated in the app -- see 049's own
--    comment noting nothing ever set it) instead of 'sold' when the
--    paying contract on the object is payment_type = 'rent'. Every other
--    branch (reserved, available) is untouched.
--
-- 3. crm.regenerate_schedule() stops forcing payment_type back to
--    'installment' on every call. Safe today only because every current
--    caller already has payment_type = 'installment' before calling it
--    -- but it would silently turn a rent contract back into an
--    installment sale the first time someone clicked "Пересчитать
--    график" on a lease.
--
-- 4. trg_auto_regenerate_schedule (055) reacts to payment_type = 'rent'
--    too, not just 'installment' -- editing an active lease's amount
--    should regenerate its schedule the same way editing a sale's does.
--
-- Идемпотентно, повторный запуск безопасен.
-- ============================================================

alter table crm.objects add column if not exists listing_type text not null default 'sale';
alter table crm.objects drop constraint if exists objects_listing_type_check;
alter table crm.objects add constraint objects_listing_type_check
  check (listing_type in ('sale', 'rent'));

create index if not exists objects_listing_type_idx on crm.objects (listing_type);

create or replace function crm.recompute_object_status(p_object_id uuid)
returns void
language sql
security definer
set search_path = crm, public
as $$
  update crm.objects
  set status = case
    when exists (
      select 1 from crm.contracts c
      where c.object_id = p_object_id and c.status <> 'cancelled'
        and c.paid_amount > 0 and c.payment_type = 'rent'
    ) then 'rented'
    when exists (
      select 1 from crm.contracts c
      where c.object_id = p_object_id and c.status <> 'cancelled' and c.paid_amount > 0
    ) then 'sold'
    when exists (
      select 1 from crm.contracts c
      where c.object_id = p_object_id and c.status <> 'cancelled'
    ) then 'reserved'
    -- Lost when this definition was added for the rent feature (it
    -- reverted to the two-branch shape from before manual_reserved
    -- existed): a hand reservation with no contract at all fell through
    -- to 'available', so a right-click quick-booking on the shakhmatka
    -- flipped the flag but the status snapped straight back.
    when manual_reserved then 'reserved'
    else 'available'
  end::crm.object_status
  where id = p_object_id;
$$;

create or replace function crm.regenerate_schedule(
  p_contract_id uuid,
  p_months integer
)
returns integer
language plpgsql
security definer
set search_path = crm, public
as $$
declare
  v_contract crm.contracts;
  v_remaining numeric;
  v_base numeric;
  v_amount numeric;
  i integer;
begin
  if not crm.can_write() then
    raise exception 'Read-only role';
  end if;
  if p_months is null or p_months < 1 then
    raise exception 'Months must be at least 1';
  end if;

  select * into v_contract from crm.contracts where id = p_contract_id;
  if not found then
    raise exception 'Contract not found';
  end if;

  v_remaining := greatest(v_contract.amount - v_contract.paid_amount, 0);
  if v_remaining <= 0 then
    raise exception 'Nothing left to schedule';
  end if;

  -- Пересборка графика -- это одно действие, а не 2N. Построчный журнал
  -- на это время выключен (только в этой транзакции), в конце -- одна запись.
  perform set_config('crm.audit_off', 'on', true);

  -- Только план; фактические (оплаченные) строки неприкосновенны.
  delete from crm.contract_payments
  where contract_id = p_contract_id and paid = false;

  v_base := floor(v_remaining / p_months * 100) / 100;
  for i in 1..p_months loop
    if i = p_months then
      v_amount := round((v_remaining - v_base * (p_months - 1)) * 100) / 100;
    else
      v_amount := v_base;
    end if;
    insert into crm.contract_payments (contract_id, due_date, amount, paid, paid_date)
    values (p_contract_id, (current_date + (i || ' month')::interval)::date, v_amount, false, null);
  end loop;

  perform set_config('crm.audit_off', 'off', true);

  insert into crm.audit_log (actor_id, action, entity_type, entity_id, details)
  values (
    auth.uid(), 'update', 'contract', p_contract_id,
    jsonb_build_object(
      'schedule_payments', p_months,
      'schedule_remaining', v_remaining,
      '_context', crm.audit_context('contract', p_contract_id)
    )
  );

  -- payment_type is deliberately NOT touched here anymore -- see this
  -- migration's header. installment_months is the only thing this
  -- function's caller expects it to keep in sync.
  update crm.contracts
  set installment_months = p_months
  where id = p_contract_id;

  return p_months;
end;
$$;

create or replace function crm.auto_regenerate_schedule()
returns trigger
language plpgsql
security definer
set search_path = crm, public
as $$
begin
  if NEW.payment_type in ('installment', 'rent')
     and NEW.installment_months is not null
     and NEW.installment_months > 0
     and NEW.amount is distinct from OLD.amount
     and NEW.amount > NEW.paid_amount
     and exists (
       select 1 from crm.contract_payments
       where contract_id = NEW.id and paid = false
     )
  then
    perform crm.regenerate_schedule(NEW.id, NEW.installment_months);
  end if;
  return NEW;
end;
$$;

-- ### 061_overdue_by_building_remaining.sql

-- ============================================================
-- 061: crm.overdue_by_building() also returns remaining_total.
--
-- The Debtors page's per-ЖК chart has always carried a caption saying
-- "red = the overdue portion, grey = the whole remaining balance on those
-- same contracts" -- but overdue_by_building() only ever returned
-- total_overdue, so HBarChart drew a single red bar and the "grey" half of
-- that promise never existed on screen. Reported back as "the charts make
-- no sense": a bar ranked purely by overdue amount, with a caption
-- describing a comparison that isn't there, reads as noise, not
-- information. This adds the missing number so the chart can actually
-- draw what the caption already claimed.
--
-- Mirrors exactly how crm.overdue_contracts()/overdue_totals() already
-- compute remaining_total (earlier in this file): the whole unpaid
-- balance of the contract (amount - paid_amount), not just its overdue
-- slice. Grouped per building+currency here instead of per contract, via
-- a small CTE so each contract's remaining is counted once even though
-- overdue_installments can carry several unpaid rows for it.
-- ============================================================

drop function if exists crm.overdue_by_building();

create function crm.overdue_by_building()
returns table (
  building_id uuid,
  building_name text,
  currency text,
  contracts int,
  total_overdue numeric,
  remaining_total numeric
)
language sql
stable
security invoker
set search_path = crm, public
as $$
  with base as (
    select
      o.building_id,
      coalesce(b.name, '—') as building_name,
      c.currency::text as currency,
      c.id as contract_id,
      oi.unpaid_amount,
      c.amount,
      c.paid_amount
    from crm.overdue_installments oi
    join crm.contracts c on c.id = oi.contract_id
    left join crm.objects   o on o.id = c.object_id
    left join crm.buildings b on b.id = o.building_id
    where oi.due_date < current_date
      and oi.unpaid_amount > 0.005
  ),
  per_contract as (
    select distinct on (contract_id)
      building_id, currency, contract_id, amount, paid_amount
    from base
  ),
  remaining as (
    select building_id, currency, sum(greatest(amount - paid_amount, 0)) as remaining_total
    from per_contract
    group by building_id, currency
  )
  select
    b.building_id,
    b.building_name,
    b.currency,
    (count(distinct b.contract_id))::int,
    sum(b.unpaid_amount),
    coalesce(r.remaining_total, 0)
  from base b
  left join remaining r
    on r.building_id is not distinct from b.building_id
   and r.currency = b.currency
  group by b.building_id, b.building_name, b.currency, r.remaining_total
  order by sum(b.unpaid_amount) desc;
$$;

grant execute on function crm.overdue_by_building() to authenticated;

-- ### 062_dashboard_summary_period_scoping.sql

-- ============================================================
-- 062: paid/debt/top-debtors on the dashboard stop vanishing under
--      "Сегодня"/"Этот месяц" -- they were being filtered by the
--      contract's SIGN date, not by whether any money moved in the
--      period.
--
-- ЧТО БЫЛО НЕ ТАК. money (paid/debt) and top_debtors were both computed
-- from live_contracts, which restricts to contracts whose signed_date
-- falls inside [p_from, p_to]. That's the right scope for a SALES metric
-- ("how much did we sign this period") -- month_rev/day_rev/bld_rev
-- legitimately want exactly that. It is the wrong scope for paid/debt/
-- top_debtors: those are CURRENT-STATE totals (how much has been
-- collected in total, how much is still owed in total, who owes the
-- most right now), which have nothing to do with when a contract was
-- SIGNED. A payment received today on a contract signed six months ago
-- is real income today -- but with the "Сегодня" period picked, that
-- contract falls outside [today, today] by signed_date, so its entire
-- paid_amount (not just today's payment) silently dropped out of
-- "Даромади умумӣ", its remaining balance dropped out of "Қарзи
-- харидорон", and the client dropped out of "Бузургтарин қарздорон" --
-- while the "Воридот аз рӯи рӯз" chart right above it (built from
-- contract_payments.paid_date, not signed_date) correctly showed the
-- same payment. Two panels on the same page, same underlying event,
-- contradicting each other.
--
-- ЧТО МЕНЯЕТСЯ. A new CTE, live_state_contracts: scoped_contracts minus
-- cancelled, WITHOUT the signed_date/period restriction live_contracts
-- adds. money and debtors now read from it instead of live_contracts.
-- Building scope (p_building_id) still applies to both, same as before
-- -- only the period picker (p_from/p_to) stops touching them.
-- month_rev, day_rev, bld_rev are untouched: revenue-over-time and
-- revenue-by-building are genuinely period/sales metrics, and stay
-- exactly as period-scoped as before.
--
-- Also closes a second, smaller inconsistency found while in here:
-- day_rev joined scoped_contracts with no status filter at all, so a
-- payment recorded against a contract that was LATER cancelled still
-- counted in the daily chart, even though month_rev already excludes
-- cancelled contracts from the equivalent monthly figure. day_rev's
-- join now carries the same "status <> 'cancelled'" condition
-- month_rev's does.
--
-- Idempotent, safe to run again.
-- ============================================================

create or replace function crm.dashboard_summary(
  p_building_id uuid default null,
  p_from date default null,
  p_to date default null
)
returns jsonb
language sql
stable
security invoker
set search_path = crm, public
as $$
with
scoped_objects as (
  select o.id, o.status, o.building_id, o.price, o.currency, o.area
  from crm.objects o
  left join crm.buildings b on b.id = o.building_id
  where case
          when p_building_id is not null then o.building_id = p_building_id
          else coalesce(b.construction_status, 'in_progress') <> 'completed'
        end
),
scoped_contracts as (
  select c.id, c.client_id, c.amount, c.paid_amount, c.currency,
         c.signed_date, c.status, so.building_id
  from crm.contracts c
  join scoped_objects so on so.id = c.object_id
),
-- Every live (not cancelled) contract in scope, with NO date restriction.
-- The one thing paid/debt/top_debtors actually want: today's, this
-- month's and this year's totals are all the same number, because those
-- three are a snapshot of current state, not a flow during the period.
live_state_contracts as (
  select *
  from scoped_contracts
  where status <> 'cancelled'
),
-- Same, but additionally restricted to contracts SIGNED inside the
-- chosen period -- for the metrics that actually mean "sales this
-- period" (month_rev, day_rev's contract lookup, bld_rev).
live_contracts as (
  select *
  from live_state_contracts
  where (p_from is null or (signed_date is not null and signed_date >= p_from))
    and (p_to   is null or (signed_date is not null and signed_date <= p_to))
),
rel_buildings as (
  select b.id, b.name
  from crm.buildings b
  where case
          when p_building_id is not null then b.id = p_building_id
          else b.construction_status <> 'completed'
        end
),
obj_stats as (
  select
    (count(*))::int                                             as total,
    (count(*) filter (where status = 'available'))::int         as available,
    (count(*) filter (where status = 'reserved'))::int          as reserved,
    (count(*) filter (where status = 'sold'))::int              as sold,
    (count(*) filter (where status = 'in_progress'))::int       as in_progress,
    coalesce(sum(area), 0)                                      as area_total,
    coalesce(sum(area) filter (where status = 'available'), 0)   as area_available,
    coalesce(sum(area) filter (where status = 'reserved'), 0)    as area_reserved,
    coalesce(sum(area) filter (where status = 'sold'), 0)        as area_sold,
    coalesce(sum(area) filter (where status = 'rented'), 0)      as area_rented,
    coalesce(sum(area) filter (where status = 'in_progress'), 0) as area_in_progress,
    coalesce(sum(price) filter (where status <> 'sold' and currency <> 'USD'), 0) as pot_tjs,
    coalesce(sum(price) filter (where status <> 'sold' and currency  = 'USD'), 0) as pot_usd,
    (count(*) filter (where status <> 'sold' and price is not null and price > 0))::int
      as pot_units,
    (count(*) filter (where status <> 'sold' and (price is null or price = 0)))::int
      as pot_no_price
  from scoped_objects
),
money as (
  select
    coalesce(sum(paid_amount) filter (where currency <> 'USD'), 0) as paid_tjs,
    coalesce(sum(paid_amount) filter (where currency  = 'USD'), 0) as paid_usd,
    coalesce(sum(greatest(amount - paid_amount, 0)) filter (where currency <> 'USD'), 0) as debt_tjs,
    coalesce(sum(greatest(amount - paid_amount, 0)) filter (where currency  = 'USD'), 0) as debt_usd
  from live_state_contracts
),
overdue as (
  select
    coalesce(sum(oi.unpaid_amount) filter (where c.currency <> 'USD'), 0) as tjs,
    coalesce(sum(oi.unpaid_amount) filter (where c.currency  = 'USD'), 0) as usd,
    (count(distinct c.id))::int                                          as contracts
  from crm.overdue_installments oi
  join scoped_contracts c on c.id = oi.contract_id
  where oi.due_date < current_date
    and oi.unpaid_amount > 0.005
    and c.status <> 'cancelled'
),
-- The end of the window: the last month that actually has a signing, so the
-- chart lands where the data is even if the newest contract is not this month.
month_end as (
  select coalesce(
           date_trunc('month', max(signed_date)),
           date_trunc('month', current_date)
         ) as m
  from scoped_contracts
  where status <> 'cancelled' and signed_date is not null
),
-- Six consecutive calendar months. A month with no sales must be a zero on the
-- axis, not a missing point.
month_axis as (
  select to_char(g, 'YYYY-MM') as month
  from month_end me,
       generate_series(me.m - interval '5 months', me.m, interval '1 month') as g
),
month_rev as (
  select
    ax.month,
    coalesce(sum(c.amount) filter (where c.currency <> 'USD'), 0) as tjs,
    coalesce(sum(c.amount) filter (where c.currency  = 'USD'), 0) as usd
  from month_axis ax
  left join scoped_contracts c
         on c.status <> 'cancelled'
        and c.signed_date is not null
        and to_char(c.signed_date, 'YYYY-MM') = ax.month
  group by ax.month
  order by ax.month
),
-- Same treatment for the daily chart: every day in the chosen period appears,
-- including the ones with no money received.
day_axis as (
  select g::date as day
  from generate_series(
         coalesce(p_from, current_date),
         coalesce(p_to, current_date),
         interval '1 day'
       ) as g
  where p_from is not null and p_to is not null
),
day_rev as (
  select
    ax.day,
    coalesce(sum(p.amount) filter (where c.currency <> 'USD'), 0) as tjs,
    coalesce(sum(p.amount) filter (where c.currency  = 'USD'), 0) as usd
  from day_axis ax
  left join crm.contract_payments p
         on p.paid and p.paid_date = ax.day
  left join scoped_contracts c
         on c.id = p.contract_id
        and c.status <> 'cancelled'
  group by ax.day
  order by ax.day
),
occ as (
  select
    rb.id, rb.name,
    (count(*))::int                                          as total,
    (count(*) filter (where so.status = 'available'))::int    as available,
    (count(*) filter (where so.status = 'reserved'))::int     as reserved,
    (count(*) filter (where so.status = 'sold'))::int         as sold,
    (count(*) filter (where so.status = 'rented'))::int       as rented,
    (count(*) filter (where so.status = 'in_progress'))::int  as in_progress
  from rel_buildings rb
  join scoped_objects so on so.building_id = rb.id
  group by rb.id, rb.name
),
bld_rev as (
  select
    rb.id, rb.name,
    coalesce(sum(lc.amount) filter (where lc.currency <> 'USD'), 0) as tjs,
    coalesce(sum(lc.amount) filter (where lc.currency  = 'USD'), 0) as usd
  from rel_buildings rb
  join live_contracts lc on lc.building_id = rb.id
  group by rb.id, rb.name
),
debtors as (
  select
    lc.client_id,
    cl.name,
    lc.currency::text                       as currency,
    sum(lc.amount - lc.paid_amount)         as remaining
  from live_state_contracts lc
  join crm.clients cl on cl.id = lc.client_id
  where lc.amount - lc.paid_amount > 0
  group by 1, 2, 3
  order by 4 desc
  limit 5
),
completed as (
  select
    (select count(*) from crm.buildings where construction_status = 'completed')::int as buildings,
    (select count(*)
       from crm.objects o
       join crm.buildings b on b.id = o.building_id
      where b.construction_status = 'completed')::int as units
)
select jsonb_build_object(
  'counts', (
    select jsonb_build_object(
      'total', total, 'available', available, 'reserved', reserved,
      'sold', sold, 'in_progress', in_progress
    ) from obj_stats
  ),
  'area', (select jsonb_build_object('total', area_total, 'available', area_available) from obj_stats),
  'area_split', (
    select jsonb_build_object(
      'sold', area_sold, 'reserved', area_reserved, 'available', area_available,
      'rented', area_rented, 'in_progress', area_in_progress
    ) from obj_stats
  ),
  'potential', (select jsonb_build_object('tjs', pot_tjs, 'usd', pot_usd) from obj_stats),
  'potential_units', (select pot_units from obj_stats),
  'potential_no_price', (select pot_no_price from obj_stats),
  'paid', (select jsonb_build_object('tjs', paid_tjs, 'usd', paid_usd) from money),
  'debt', (select jsonb_build_object('tjs', debt_tjs, 'usd', debt_usd) from money),
  'overdue', (select jsonb_build_object('tjs', tjs, 'usd', usd) from overdue),
  'overdue_contracts', (select contracts from overdue),
  'revenue_months', coalesce((
    select jsonb_agg(jsonb_build_object('month', month, 'tjs', tjs, 'usd', usd) order by month)
    from month_rev
  ), '[]'::jsonb),
  'revenue_days', coalesce((
    select jsonb_agg(jsonb_build_object('day', day, 'tjs', tjs, 'usd', usd) order by day)
    from day_rev
  ), '[]'::jsonb),
  'occupancy', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', id, 'name', name, 'total', total,
      'available', available, 'reserved', reserved, 'sold', sold,
      'rented', rented, 'in_progress', in_progress
    ) order by name)
    from occ
  ), '[]'::jsonb),
  'revenue_by_building', coalesce((
    select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'tjs', tjs, 'usd', usd)
                     order by (tjs + usd) desc)
    from bld_rev where tjs > 0 or usd > 0
  ), '[]'::jsonb),
  'top_debtors', coalesce((
    select jsonb_agg(jsonb_build_object(
      'client_id', client_id, 'name', name, 'currency', currency, 'remaining', remaining
    ) order by remaining desc)
    from debtors
  ), '[]'::jsonb),
  'completed', (select jsonb_build_object('buildings', buildings, 'units', units) from completed)
);
$$;

grant execute on function crm.dashboard_summary(uuid, date, date) to authenticated;

-- ### 063_sms_broadcast_recipients.sql

-- ============================================================
-- 063: crm.sms_broadcast_recipients() -- who a custom SMS broadcast
--      reaches, for one of three audiences.
--
-- Backs the "Своя рассылка" feature in Settings → SMS: an admin writes
-- their own text (not one of the two fixed payment-reminder templates)
-- and sends it to either every client, everyone with a contract in one
-- chosen building, or everyone currently overdue -- the exact scenario
-- that prompted this ("дом сдан, приходите за ключами" needs every
-- buyer in THAT building, not a payment reminder).
--
-- One function for all three audiences rather than three separate
-- queries (one in SQL, two hand-rolled in JS) so the definition of
-- "a client with a live contract" and "a client who's overdue" only
-- exists once, in the same place overdue_contracts()/dashboard_summary()
-- already define it. security invoker + granted to authenticated, same
-- as those two: RLS still applies, so a scoped manager (if ever given
-- access to this feature) would only ever see their own clients.
--
-- distinct on (cl.id): a client with two contracts in the audience
-- must appear once, not once per contract -- otherwise they'd get the
-- same SMS twice.
-- ============================================================

create or replace function crm.sms_broadcast_recipients(
  p_audience text,             -- 'all' | 'building' | 'debtors'
  p_building_id uuid default null
)
returns table (
  client_id uuid,
  name text,
  phone text,
  phone2 text
)
language sql
stable
security invoker
set search_path = crm, public
as $$
  with base as (
    select distinct on (cl.id)
      cl.id as client_id,
      cl.name,
      cl.phone,
      cl.phone2
    from crm.contracts c
    join crm.clients cl on cl.id = c.client_id
    left join crm.objects o on o.id = c.object_id
    where c.status <> 'cancelled'
      and (p_audience <> 'building' or o.building_id = p_building_id)
      and (
        p_audience <> 'debtors'
        or exists (
          select 1
          from crm.overdue_installments oi
          where oi.contract_id = c.id
            and oi.due_date < current_date
            and oi.unpaid_amount > 0.005
        )
      )
    order by cl.id
  )
  select client_id, name, phone, phone2
  from base
  order by name;
$$;

grant execute on function crm.sms_broadcast_recipients(text, uuid) to authenticated;

-- ### 064_merge_clients.sql

-- ============================================================
-- 064: crm.merge_clients() -- a manager typed the same person in twice
-- (a name off by one letter is the usual way it happens), and the fix
-- has to move every contract and task off the duplicate before it can
-- be deleted at all -- crm.contracts.client_id is "on delete restrict",
-- so Supabase's own "delete this client" already refuses outright while
-- contracts point at it, with no path forward from the UI.
--
-- p_keep_id survives, p_remove_id is folded into it and deleted:
--   - every crm.contracts/crm.tasks row pointing at p_remove_id is
--     repointed to p_keep_id first (this is what actually unblocks the
--     delete);
--   - any field blank on the kept client (phone, email, passport...) is
--     filled in from the removed one instead of just being dropped --
--     the two records almost never have identical gaps, and losing a
--     phone number the duplicate happened to have on file would make
--     the merge itself the reason a client becomes unreachable;
--   - notes from both are concatenated, not overwritten -- an admin's
--     note on the duplicate is real history, not noise to discard.
--
-- Admin-only, checked here (not just in the UI): this reassigns a
-- client's whole paper trail and permanently deletes a row, which is a
-- different order of consequence than the ordinary crm.can_write()
-- (admin OR manager) gate the rest of the app's writes use.
--
-- Идемпотентно в том смысле, что важен: вызов с уже удалённым
-- p_remove_id просто завершится ошибкой "Duplicate client not found",
-- а не удалит что-то не то.
-- ============================================================

create or replace function crm.merge_clients(p_keep_id uuid, p_remove_id uuid)
returns void
language plpgsql
security definer
set search_path = crm, public
as $$
declare
  v_keep crm.clients;
  v_remove crm.clients;
begin
  if crm.my_role() <> 'admin' then
    raise exception 'Only an admin can merge clients';
  end if;
  if p_keep_id = p_remove_id then
    raise exception 'Cannot merge a client with itself';
  end if;

  select * into v_keep from crm.clients where id = p_keep_id;
  if not found then
    raise exception 'Client to keep not found';
  end if;
  select * into v_remove from crm.clients where id = p_remove_id;
  if not found then
    raise exception 'Duplicate client not found';
  end if;

  update crm.clients
  set phone = coalesce(nullif(v_keep.phone, ''), v_remove.phone),
      phone2 = coalesce(nullif(v_keep.phone2, ''), v_remove.phone2),
      email = coalesce(nullif(v_keep.email, ''), v_remove.email),
      passport = coalesce(nullif(v_keep.passport, ''), v_remove.passport),
      passport_issued_by = coalesce(nullif(v_keep.passport_issued_by, ''), v_remove.passport_issued_by),
      birth_date = coalesce(v_keep.birth_date, v_remove.birth_date),
      address = coalesce(nullif(v_keep.address, ''), v_remove.address),
      interested_object_id = coalesce(v_keep.interested_object_id, v_remove.interested_object_id),
      notes = nullif(
        trim(both E'\n' from concat_ws(E'\n', nullif(v_keep.notes, ''), nullif(v_remove.notes, ''))),
        ''
      )
  where id = p_keep_id;

  update crm.contracts set client_id = p_keep_id where client_id = p_remove_id;
  update crm.tasks set client_id = p_keep_id where client_id = p_remove_id;

  delete from crm.clients where id = p_remove_id;
end;
$$;

grant execute on function crm.merge_clients(uuid, uuid) to authenticated;

-- ### 066_finance.sql

-- ============================================================
-- 066: ФИНАНСЫ -- приходы и расходы по зданиям, роль «бухгалтер».
--
-- ЗАЧЕМ. Программа знала про деньги только одно: платежи клиентов по
-- договорам. Куда уходят деньги (материалы, подрядчики, зарплата) и сколько
-- на самом деле заработал каждый дом -- нигде не фиксировалось.
--
-- ЧТО ДОБАВЛЯЕТ ЭТОТ БЛОК:
--   * роль 'accountant' (бухгалтер): видит и ведёт финансы, но НЕ видит
--     клиентов, договоры и шахматку (has_role()/can_write() не расширяются);
--     директор видит финансы только на чтение;
--   * crm.finance_categories -- статьи прихода и расхода (можно менять);
--   * crm.finance_entries -- операции: приход или расход, дата, сумма,
--     валюта (сомони и доллары НЕ смешиваются), статья, здание, контрагент;
--     расход относится к ЗДАНИЮ (не к квартире) или ни к какому (общие
--     расходы компании);
--   * триггер crm.mirror_contract_payment -- каждый оплаченный платёж по
--     договору сам становится строкой прихода (двойного ввода нет; такие
--     строки вручную не правятся -- меняйте сам платёж по договору);
--   * crm.finance_overview(from, to, building) -- итоги, по месяцам, по
--     статьям и по зданиям одним запросом;
--   * правки и удаления ручных операций попадают в журнал событий.
--
-- Идемпотентно -- повторный запуск ничего не ломает и не задваивает.
-- ============================================================

-- ---------- роль «бухгалтер» ----------
alter table crm.profiles drop constraint if exists profiles_role_check;
alter table crm.profiles
  add constraint profiles_role_check
  check (role in ('admin', 'manager', 'director', 'accountant', 'procurement'));

-- Видит финансы: админ, бухгалтер, директор (последний -- только чтение).
create or replace function crm.can_view_finance()
returns boolean
language sql
security definer
set search_path = crm, public
stable
as $$
  select crm.my_role() in ('admin', 'accountant', 'director');
$$;

-- Ведёт финансы (создаёт, правит, удаляет): админ и бухгалтер.
create or replace function crm.can_manage_finance()
returns boolean
language sql
security definer
set search_path = crm, public
stable
as $$
  select crm.my_role() in ('admin', 'accountant');
$$;

grant execute on function crm.can_view_finance() to authenticated;
grant execute on function crm.can_manage_finance() to authenticated;

-- Бухгалтеру нужны названия зданий (для выбора и отчётов), но не квартиры.
create or replace function crm.can_view_building(p_building_id uuid)
returns boolean
language sql
security definer
set search_path = crm, public
stable
as $$
  select case
    when crm.my_role() in ('admin', 'director', 'accountant') then true
    else exists (
      select 1 from crm.manager_buildings mb
      where mb.user_id = auth.uid() and mb.building_id = p_building_id
    )
  end;
$$;

-- Название компании, тема и курс нужны и бухгалтеру.
drop policy if exists "settings_select" on crm.settings;
create policy "settings_select" on crm.settings
  for select to authenticated
  using (crm.has_role() or crm.can_view_finance());

-- Назначение роли: добавляем 'accountant'.
create or replace function crm.set_user_role(p_user uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = crm, public
as $$
begin
  if not crm.is_admin() then
    raise exception 'Только администратор может менять роли';
  end if;
  if p_role not in ('admin', 'manager', 'director', 'accountant', 'none') then
    raise exception 'Неизвестная роль: %', p_role;
  end if;
  if p_user = auth.uid() and p_role <> 'admin' then
    raise exception 'Нельзя снять роль администратора с самого себя';
  end if;

  if p_role = 'none' then
    delete from crm.profiles where id = p_user;
  else
    insert into crm.profiles (id, role)
    values (p_user, p_role)
    on conflict (id) do update set role = excluded.role;
  end if;
end;
$$;

grant execute on function crm.set_user_role(uuid, text) to authenticated;

-- ---------- типы ----------
do $idem$ begin
  create type crm.finance_kind as enum ('income', 'expense');
exception when duplicate_object then null;
end $idem$;

-- ---------- статьи ----------
create table if not exists crm.finance_categories (
  id uuid primary key default gen_random_uuid(),
  kind crm.finance_kind not null,
  name text not null,
  -- служебный код: по нему находится статья, которую программа использует
  -- сама («Оплата от клиентов»); переименовать её можно, удалить нельзя
  code text unique,
  sort integer not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

alter table crm.finance_categories enable row level security;

-- ---------- операции ----------
create table if not exists crm.finance_entries (
  id uuid primary key default gen_random_uuid(),
  kind crm.finance_kind not null,
  occurred_on date not null,
  amount numeric not null check (amount > 0),
  currency crm.currency not null default 'TJS',
  category_id uuid references crm.finance_categories(id) on delete restrict,
  -- к какому зданию относится; null = общие расходы/приход компании
  building_id uuid references crm.buildings(id) on delete set null,
  counterparty text,
  note text,
  attachment_url text,
  -- заполнено только у строки-зеркала платежа по договору
  contract_payment_id uuid references crm.contract_payments(id) on delete cascade,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- один платёж по договору = не более одной строки прихода
create unique index if not exists finance_entries_payment_uidx
  on crm.finance_entries (contract_payment_id)
  where contract_payment_id is not null;

alter table crm.finance_entries enable row level security;

drop trigger if exists finance_entries_set_updated_at on crm.finance_entries;
create trigger finance_entries_set_updated_at
  before update on crm.finance_entries
  for each row execute function crm.set_updated_at();

-- ---------- стартовые статьи ----------
insert into crm.finance_categories (kind, name, code, sort)
values ('income', 'Оплата от клиентов', 'contract_payments', 1)
on conflict (code) do nothing;

-- Других стартовых статей нет: компания сама заводит свои (Настройки ->
-- Финансы). Раньше здесь сеялись 11 русских статей при КАЖДОМ запуске файла,
-- если статьи с таким названием не находилось -- то есть после переименования
-- («Зарплата» -> «Маош») они возвращались заново и давали дубли. См. блок 073.

-- ---------- права доступа (RLS) ----------
drop policy if exists "finance_categories_select" on crm.finance_categories;
create policy "finance_categories_select" on crm.finance_categories
  for select to authenticated using (crm.can_view_finance());
drop policy if exists "finance_categories_write" on crm.finance_categories;
create policy "finance_categories_write" on crm.finance_categories
  for all to authenticated
  using (crm.can_manage_finance()) with check (crm.can_manage_finance());

-- Смотреть -- can_view_finance. Создавать/править/удалять руками --
-- can_manage_finance и только НЕ зеркальные строки (contract_payment_id is
-- null): зеркала ведёт триггер (он выполняется мимо RLS).
drop policy if exists "finance_entries_select" on crm.finance_entries;
create policy "finance_entries_select" on crm.finance_entries
  for select to authenticated using (crm.can_view_finance());
drop policy if exists "finance_entries_insert" on crm.finance_entries;
create policy "finance_entries_insert" on crm.finance_entries
  for insert to authenticated
  with check (crm.can_manage_finance() and contract_payment_id is null);
drop policy if exists "finance_entries_update" on crm.finance_entries;
create policy "finance_entries_update" on crm.finance_entries
  for update to authenticated
  using (crm.can_manage_finance() and contract_payment_id is null)
  with check (crm.can_manage_finance() and contract_payment_id is null);
drop policy if exists "finance_entries_delete" on crm.finance_entries;
create policy "finance_entries_delete" on crm.finance_entries
  for delete to authenticated
  using (crm.can_manage_finance() and contract_payment_id is null);

grant all on crm.finance_categories, crm.finance_entries to authenticated;
grant all on crm.finance_categories, crm.finance_entries to service_role;

-- ---------- зеркало: платёж по договору -> приход ----------
create or replace function crm.mirror_contract_payment()
returns trigger
language plpgsql
security definer
set search_path = crm, public
as $$
declare
  v_contract crm.contracts;
  v_client_name text;
  v_object_name text;
  v_building_id uuid;
  v_category uuid;
  v_note text;
begin
  -- не оплачено (или перестало быть оплаченным) -- строки прихода быть не должно
  if not new.paid then
    delete from crm.finance_entries where contract_payment_id = new.id;
    return new;
  end if;

  select c.* into v_contract from crm.contracts c where c.id = new.contract_id;
  select cl.name into v_client_name from crm.clients cl where cl.id = v_contract.client_id;
  select o.name, o.building_id into v_object_name, v_building_id
    from crm.objects o where o.id = v_contract.object_id;

  select id into v_category from crm.finance_categories where code = 'contract_payments';

  v_note := concat_ws(', ',
    case when nullif(v_contract.number, '') is not null
         then 'Договор №' || v_contract.number end,
    v_object_name
  );

  insert into crm.finance_entries
    (kind, occurred_on, amount, currency, category_id, building_id,
     counterparty, note, contract_payment_id, created_by)
  values
    ('income', coalesce(new.paid_date, new.due_date), new.amount, v_contract.currency,
     v_category, v_building_id, v_client_name, v_note, new.id, auth.uid())
  on conflict (contract_payment_id) where contract_payment_id is not null
  do update set
    occurred_on  = excluded.occurred_on,
    amount       = excluded.amount,
    currency     = excluded.currency,
    building_id  = excluded.building_id,
    counterparty = excluded.counterparty,
    note         = excluded.note;

  return new;
end;
$$;

drop trigger if exists trg_mirror_contract_payment on crm.contract_payments;
create trigger trg_mirror_contract_payment
after insert or update on crm.contract_payments
for each row execute function crm.mirror_contract_payment();

-- Разовое зеркалирование уже принятых платежей (у которых ещё нет строки).
insert into crm.finance_entries
  (kind, occurred_on, amount, currency, category_id, building_id,
   counterparty, note, contract_payment_id)
select
  'income',
  coalesce(p.paid_date, p.due_date),
  p.amount,
  c.currency,
  (select id from crm.finance_categories where code = 'contract_payments'),
  o.building_id,
  cl.name,
  concat_ws(', ',
    case when nullif(c.number, '') is not null then 'Договор №' || c.number end,
    o.name
  ),
  p.id
from crm.contract_payments p
join crm.contracts c on c.id = p.contract_id
left join crm.clients cl on cl.id = c.client_id
left join crm.objects o on o.id = c.object_id
where p.paid
  and not exists (select 1 from crm.finance_entries e where e.contract_payment_id = p.id);

-- ---------- журнал событий ----------
-- Ручные операции пишутся в журнал; зеркала платежей -- нет (платёж по
-- договору уже там есть).
create or replace function crm.audit_context(p_entity_type text, p_entity_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = crm, public
as $$
declare
  v_client_name text;
  v_contract_number text;
  v_object_name text;
  v_building_name text;
  v_currency crm.currency;
  v_category_name text;
begin
  if p_entity_type = 'client' then
    select c.name into v_client_name
    from crm.clients c
    where c.id = p_entity_id;

  elsif p_entity_type = 'contract' then
    select cl.name, c.number, o.name, b.name, c.currency
      into v_client_name, v_contract_number, v_object_name, v_building_name, v_currency
    from crm.contracts c
    left join crm.clients cl on cl.id = c.client_id
    left join crm.objects o on o.id = c.object_id
    left join crm.buildings b on b.id = o.building_id
    where c.id = p_entity_id;

  elsif p_entity_type = 'contract_payment' then
    select cl.name, c.number, o.name, b.name, c.currency
      into v_client_name, v_contract_number, v_object_name, v_building_name, v_currency
    from crm.contract_payments p
    join crm.contracts c on c.id = p.contract_id
    left join crm.clients cl on cl.id = c.client_id
    left join crm.objects o on o.id = c.object_id
    left join crm.buildings b on b.id = o.building_id
    where p.id = p_entity_id;

  elsif p_entity_type = 'object' then
    select o.name, b.name into v_object_name, v_building_name
    from crm.objects o
    left join crm.buildings b on b.id = o.building_id
    where o.id = p_entity_id;

  elsif p_entity_type = 'finance_entry' then
    select e.counterparty, b.name, e.currency, c.name
      into v_client_name, v_building_name, v_currency, v_category_name
    from crm.finance_entries e
    left join crm.buildings b on b.id = e.building_id
    left join crm.finance_categories c on c.id = e.category_id
    where e.id = p_entity_id;
  end if;

  return jsonb_strip_nulls(jsonb_build_object(
    'client_name', v_client_name,
    'contract_number', v_contract_number,
    'object_name', v_object_name,
    'building_name', v_building_name,
    'category_name', v_category_name,
    'currency', v_currency
  ));
end;
$$;

drop trigger if exists trg_audit_change_finance_entries on crm.finance_entries;
create trigger trg_audit_change_finance_entries
after insert or update on crm.finance_entries
for each row when (new.contract_payment_id is null)
execute function crm.log_change('finance_entry');

drop trigger if exists trg_audit_delete_finance_entries on crm.finance_entries;
create trigger trg_audit_delete_finance_entries
before delete on crm.finance_entries
for each row when (old.contract_payment_id is null)
execute function crm.log_delete('finance_entry');

-- ### 067_finance_lines_rollup.sql

-- ============================================================
-- 067: ФИНАНСЫ -- «количество × цена = итого», быстрые итоги по месяцам,
-- сверка.
--
-- ЗАЧЕМ.
--   1) Расход/приход теперь записывается строкой: вид (название),
--      количество, единица, цена за единицу. Итог считает БАЗА, а не
--      браузер (crm.finance_entries_calc): round(количество × цена, 2) на
--      точном numeric, без плавающей запятой. Что бы ни прислал браузер,
--      сумма в базе всегда равна количеству × цене.
--   2) Записей будет много (сотни в день, десятки тысяч в год). Считать
--      итоги «за всё время» по сырым строкам с каждым открытием экрана --
--      значит тормозить всё сильнее с каждым годом. Поэтому рядом ведётся
--      сводка по месяцам crm.finance_monthly (месяц × тип × валюта ×
--      здание × статья), её обновляют триггеры на каждую запись. Итоги за
--      целые месяцы читаются из неё (несколько строк на месяц), а сырые
--      строки сканируются только для неполных месяцев на краях периода.
--      Старые месяцы не сканируются никогда.
--   3) crm.finance_rebuild_rollup() пересобирает сводку с нуля из сырых
--      записей (самолечение), crm.finance_check() сверяет: сводку с
--      записями и приход в журнале -- с оплаченными платежами по договорам.
--
-- Идемпотентно -- повторный запуск ничего не ломает и не задваивает.
-- ============================================================

-- ---------- строка операции ----------
alter table crm.finance_entries add column if not exists title text;
alter table crm.finance_entries add column if not exists quantity numeric;
alter table crm.finance_entries add column if not exists unit text;
alter table crm.finance_entries add column if not exists unit_price numeric;

alter table crm.finance_entries drop constraint if exists finance_entries_line_check;
alter table crm.finance_entries
  add constraint finance_entries_line_check check (
    (quantity is null) = (unit_price is null)
    and (quantity is null or quantity > 0)
    and (unit_price is null or unit_price > 0)
  );

alter table crm.finance_entries drop constraint if exists finance_entries_amount_max;
alter table crm.finance_entries
  add constraint finance_entries_amount_max check (amount < 1000000000000);

-- Итог считает база. Зеркала платежей (без количества и цены) сохраняют
-- сумму платежа как есть -- сверка с договорами должна сходиться копейка в
-- копейку.
create or replace function crm.finance_entries_calc()
returns trigger
language plpgsql
as $$
begin
  if new.quantity is not null and new.unit_price is not null then
    new.amount := round(new.quantity * new.unit_price, 2);
  end if;
  new.title := nullif(btrim(new.title), '');
  new.unit := nullif(btrim(new.unit), '');
  return new;
end;
$$;

drop trigger if exists finance_entries_calc on crm.finance_entries;
create trigger finance_entries_calc
  before insert or update on crm.finance_entries
  for each row execute function crm.finance_entries_calc();

-- Поиск по названию, контрагенту и заметке -- одной колонкой, чтобы список
-- со страницами мог одновременно фильтровать и листать по курсору.
alter table crm.finance_entries
  add column if not exists search_text text
  generated always as (
    lower(coalesce(title, '') || ' ' || coalesce(counterparty, '') || ' ' || coalesce(note, ''))
  ) stored;

-- ---------- индексы под журнал ----------
-- Список идёт по (дата, id) от новых к старым; фильтр по зданию/статье --
-- тот же порядок внутри своего значения.
create index if not exists finance_entries_list_idx
  on crm.finance_entries (occurred_on desc, id desc);
create index if not exists finance_entries_building_list_idx
  on crm.finance_entries (building_id, occurred_on desc, id desc);
create index if not exists finance_entries_category_list_idx
  on crm.finance_entries (category_id, occurred_on desc, id desc);
create index if not exists finance_entries_search_trgm
  on crm.finance_entries using gin (search_text gin_trgm_ops);
drop index if exists crm.finance_entries_occurred_idx;
drop index if exists crm.finance_entries_building_idx;
drop index if exists crm.finance_entries_category_idx;

-- ---------- сводка по месяцам ----------
-- building_key / category_key: id или нулевой uuid, если здания/статьи нет
-- (в первичном ключе не может быть null).
create table if not exists crm.finance_monthly (
  month date not null,
  kind crm.finance_kind not null,
  currency crm.currency not null,
  building_key uuid not null,
  category_key uuid not null,
  total numeric not null default 0,
  entries integer not null default 0,
  primary key (month, kind, currency, building_key, category_key)
);

alter table crm.finance_monthly enable row level security;
drop policy if exists "finance_monthly_select" on crm.finance_monthly;
create policy "finance_monthly_select" on crm.finance_monthly
  for select to authenticated using (crm.can_view_finance());
grant select on crm.finance_monthly to authenticated;
grant all on crm.finance_monthly to service_role;

create or replace function crm.finance_rollup_apply(r crm.finance_entries, p_sign integer)
returns void
language plpgsql
security definer
set search_path = crm, public
as $$
declare
  v_month date := date_trunc('month', r.occurred_on)::date;
  v_b uuid := coalesce(r.building_id, '00000000-0000-0000-0000-000000000000'::uuid);
  v_c uuid := coalesce(r.category_id, '00000000-0000-0000-0000-000000000000'::uuid);
begin
  insert into crm.finance_monthly as m (month, kind, currency, building_key, category_key, total, entries)
  values (v_month, r.kind, r.currency, v_b, v_c, p_sign * r.amount, p_sign)
  on conflict (month, kind, currency, building_key, category_key)
  do update set total = m.total + excluded.total, entries = m.entries + excluded.entries;

  if p_sign < 0 then
    delete from crm.finance_monthly
    where month = v_month and kind = r.kind and currency = r.currency
      and building_key = v_b and category_key = v_c and entries = 0;
  end if;
end;
$$;

create or replace function crm.finance_rollup_trg()
returns trigger
language plpgsql
security definer
set search_path = crm, public
as $$
begin
  if tg_op = 'UPDATE'
     and old.occurred_on = new.occurred_on and old.kind = new.kind
     and old.currency = new.currency and old.amount = new.amount
     and old.building_id is not distinct from new.building_id
     and old.category_id is not distinct from new.category_id then
    return null;
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    perform crm.finance_rollup_apply(old, -1);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform crm.finance_rollup_apply(new, 1);
  end if;
  return null;
end;
$$;

drop trigger if exists trg_finance_rollup on crm.finance_entries;
create trigger trg_finance_rollup
  after insert or update or delete on crm.finance_entries
  for each row execute function crm.finance_rollup_trg();

-- Пересборка с нуля из сырых записей.
create or replace function crm.finance_rebuild_rollup()
returns void
language plpgsql
security definer
set search_path = crm, public
as $$
begin
  if auth.uid() is not null and not crm.can_manage_finance() then
    raise exception 'Недостаточно прав';
  end if;
  delete from crm.finance_monthly where true;
  insert into crm.finance_monthly (month, kind, currency, building_key, category_key, total, entries)
  select date_trunc('month', occurred_on)::date, kind, currency,
         coalesce(building_id, '00000000-0000-0000-0000-000000000000'::uuid),
         coalesce(category_id, '00000000-0000-0000-0000-000000000000'::uuid),
         sum(amount), count(*)::int
  from crm.finance_entries
  group by 1, 2, 3, 4, 5;
end;
$$;

grant execute on function crm.finance_rebuild_rollup() to authenticated;

select crm.finance_rebuild_rollup();

-- ---------- сводка для экранов ----------
-- Целые месяцы -- из crm.finance_monthly; неполные месяцы на краях периода
-- (например 15 сентября -- 10 ноября: хвост сентября и начало ноября) --
-- из сырых записей. security invoker: замок -- RLS.
create or replace function crm.finance_overview(
  p_from date default null,
  p_to date default null,
  p_building_id uuid default null,
  p_company_only boolean default false
)
returns jsonb
language sql
stable
security invoker
set search_path = crm, public
as $$
with
bounds as (
  select
    p_from as pf,
    p_to as pt,
    -- первый месяц, целиком попадающий в период
    case when p_from is null then null::date
         when p_from = date_trunc('month', p_from)::date then p_from
         else (date_trunc('month', p_from) + interval '1 month')::date end as m0,
    -- первый день месяца ПОСЛЕ последнего целого месяца (исключительная граница)
    case when p_to is null then null::date
         when p_to = (date_trunc('month', p_to) + interval '1 month' - interval '1 day')::date
           then p_to + 1
         else date_trunc('month', p_to)::date end as m1
),
flags as (
  select *, (m0 is null or m1 is null or m0 < m1) as has_full from bounds
),
rolled as (
  select m.month, m.kind, m.currency, m.building_key, m.category_key, m.total, m.entries
  from crm.finance_monthly m, flags f
  where f.has_full
    and (f.m0 is null or m.month >= f.m0)
    and (f.m1 is null or m.month < f.m1)
    and (p_building_id is null or m.building_key = p_building_id)
    and (not p_company_only or m.building_key = '00000000-0000-0000-0000-000000000000'::uuid)
),
raw_rows as (
  -- нет ни одного целого месяца: весь период из сырых записей
  select t.* from crm.finance_entries t
  where (select not has_full from flags)
    and t.occurred_on >= (select pf from flags)
    and t.occurred_on <= (select pt from flags)
  union all
  -- неполное начало
  select t.* from crm.finance_entries t
  where (select has_full and pf is not null and m0 is not null from flags)
    and t.occurred_on >= (select pf from flags)
    and t.occurred_on < (select m0 from flags)
  union all
  -- неполный конец
  select t.* from crm.finance_entries t
  where (select has_full and pt is not null and m1 is not null from flags)
    and t.occurred_on >= (select m1 from flags)
    and t.occurred_on <= (select pt from flags)
),
raw as (
  select date_trunc('month', r.occurred_on)::date as month, r.kind, r.currency,
         coalesce(r.building_id, '00000000-0000-0000-0000-000000000000'::uuid) as building_key,
         coalesce(r.category_id, '00000000-0000-0000-0000-000000000000'::uuid) as category_key,
         sum(r.amount) as total, count(*)::int as entries
  from raw_rows r
  where (p_building_id is null or r.building_id = p_building_id)
    and (not p_company_only or r.building_id is null)
  group by 1, 2, 3, 4, 5
),
parts as (
  select * from rolled
  union all
  select * from raw
),
totals as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'currency', currency, 'income', income, 'expense', expense, 'entries', entries
  ) order by currency), '[]'::jsonb) as v
  from (
    select currency::text as currency,
           coalesce(sum(total) filter (where kind = 'income'), 0) as income,
           coalesce(sum(total) filter (where kind = 'expense'), 0) as expense,
           sum(entries)::int as entries
    from parts group by currency
  ) s
),
by_month as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'month', month, 'currency', currency, 'income', income, 'expense', expense
  ) order by month, currency), '[]'::jsonb) as v
  from (
    select to_char(month, 'YYYY-MM') as month, currency::text as currency,
           coalesce(sum(total) filter (where kind = 'income'), 0) as income,
           coalesce(sum(total) filter (where kind = 'expense'), 0) as expense
    from parts group by month, currency
  ) s
),
by_category as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'kind', kind, 'category_id', category_id, 'name', name, 'code', code,
    'currency', currency, 'total', total
  ) order by kind, total desc), '[]'::jsonb) as v
  from (
    select p.kind::text as kind,
           case when p.category_key = '00000000-0000-0000-0000-000000000000'::uuid
                then null else p.category_key end as category_id,
           c.name, c.code, p.currency::text as currency, sum(p.total) as total
    from parts p
    left join crm.finance_categories c on c.id = p.category_key
    group by p.kind, p.category_key, c.name, c.code, p.currency
  ) s
),
by_building as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'building_id', building_id, 'name', name, 'currency', currency,
    'income', income, 'expense', expense
  ) order by name nulls last, currency), '[]'::jsonb) as v
  from (
    select case when p.building_key = '00000000-0000-0000-0000-000000000000'::uuid
                then null else p.building_key end as building_id,
           b.name, p.currency::text as currency,
           coalesce(sum(p.total) filter (where p.kind = 'income'), 0) as income,
           coalesce(sum(p.total) filter (where p.kind = 'expense'), 0) as expense
    from parts p
    left join crm.buildings b on b.id = p.building_key
    group by p.building_key, b.name, p.currency
  ) s
)
-- Баланс кассы здесь НЕ считается: он не зависит ни от периода, ни от здания
-- и отдан отдельной функции crm.finance_cash() (блок 074), которая учитывает
-- ещё и деньги, выданные под отчёт.
select jsonb_build_object(
  'totals', (select v from totals),
  'by_month', (select v from by_month),
  'by_category', (select v from by_category),
  'by_building', (select v from by_building)
);
$$;

grant execute on function crm.finance_overview(date, date, uuid, boolean) to authenticated;

-- ---------- сверка ----------
-- 1) сводка по месяцам == сумма сырых записей (rollup_mismatch = 0);
-- 2) приход из платежей по договорам в журнале == оплаченные платежи в
--    договорах, по каждой валюте (сумма и количество).
-- ### 071_finance_building_resync.sql

-- ============================================================
-- 071: приход из платежа по договору иногда отвязывался от здания.
--
-- ПОЧЕМУ. И у crm.objects.building_id, и у crm.finance_entries.building_id
-- стоит "on delete set null": если здание когда-то удалили (например, после
-- «Дублировать» — пересоздали дом и снесли старую версию), все квартиры и
-- все операции, что на него ссылались, тихо остались без здания. Квартира
-- при этом могла позже снова получить здание (через саму квартиру, при
-- слиянии, при ручной правке) — а вот уже записанный приход в
-- crm.finance_entries своё здание назад не получал: строка так и висела
-- «без здания», хотя деньги были учтены верно (сумма в журнале не терялась,
-- просто не приплюсовывалась к нужному дому в «По зданиям»).
--
-- ЧТО ДЕЛАЕТ ЭТОТ БЛОК.
--   * crm.finance_check() теперь видит и такие строки: сравнивает здание,
--     записанное на приходе-зеркале, со зданием, которое СЕЙЧАС стоит у
--     квартиры по договору, и перечисляет расхождения (building_drift);
--   * crm.finance_resync_buildings() -- пересобирает здание у всех таких
--     строк по текущим данным квартиры. Только администратор.
--
-- Идемпотентно.
-- ============================================================

create or replace function crm.finance_check()
returns jsonb
language plpgsql
stable
security definer
set search_path = crm, public
as $$
declare
  v_mismatch integer;
  v_payments jsonb;
  v_gaps jsonb;
  v_building_drift jsonb;
  v_dup_categories jsonb;
  v_zero uuid := '00000000-0000-0000-0000-000000000000';
begin
  if auth.uid() is not null and not crm.can_view_finance() then
    raise exception 'Недостаточно прав';
  end if;

  select count(*) into v_mismatch
  from (
    select date_trunc('month', occurred_on)::date as month, kind, currency,
           coalesce(building_id, v_zero) as bk, coalesce(category_id, v_zero) as ck,
           sum(amount) as total, count(*)::int as entries
    from crm.finance_entries
    group by 1, 2, 3, 4, 5
  ) r
  full join crm.finance_monthly m
    on m.month = r.month and m.kind = r.kind and m.currency = r.currency
   and m.building_key = r.bk and m.category_key = r.ck
  where r.total is distinct from m.total or r.entries is distinct from m.entries;

  select coalesce(jsonb_agg(jsonb_build_object(
    'currency', cur,
    'dashboard', coalesce(d_total, 0),
    'contracts', coalesce(c_total, 0), 'journal', coalesce(j_total, 0),
    'contracts_count', coalesce(c_count, 0), 'journal_count', coalesce(j_count, 0)
  ) order by cur), '[]'::jsonb)
  into v_payments
  from (
    select coalesce(d.cur, c.cur, j.cur) as cur, d.total as d_total,
           c.total as c_total, c.cnt as c_count, j.total as j_total, j.cnt as j_count
    from (
      select currency::text as cur, sum(paid_amount) as total
      from crm.contracts group by currency
    ) d
    full join (
      select ct.currency::text as cur, sum(p.amount) as total, count(*)::int as cnt
      from crm.contract_payments p
      join crm.contracts ct on ct.id = p.contract_id
      where p.paid
      group by ct.currency
    ) c on c.cur = d.cur
    full join (
      select currency::text as cur, sum(amount) as total, count(*)::int as cnt
      from crm.finance_entries
      where contract_payment_id is not null
      group by currency
    ) j on j.cur = coalesce(d.cur, c.cur)
  ) s;

  select coalesce(jsonb_agg(g order by (g->>'gap')::numeric desc), '[]'::jsonb)
  into v_gaps
  from (
    select jsonb_build_object(
      'contract_id', c.id, 'number', c.number, 'client', cl.name,
      'currency', c.currency, 'paid_amount', c.paid_amount,
      'confirmed', coalesce(pp.total, 0),
      'gap', c.paid_amount - coalesce(pp.total, 0)
    ) as g
    from crm.contracts c
    left join crm.clients cl on cl.id = c.client_id
    left join lateral (
      select sum(p.amount) as total from crm.contract_payments p
      where p.contract_id = c.id and p.paid
    ) pp on true
    where abs(c.paid_amount - coalesce(pp.total, 0)) > 0.005
    order by abs(c.paid_amount - coalesce(pp.total, 0)) desc
    limit 20
  ) s;

  -- Приходы-зеркала, у которых здание в журнале разошлось со зданием,
  -- которое сейчас стоит у квартиры этого договора.
  select coalesce(jsonb_agg(jsonb_build_object(
    'contract_id', c.id, 'number', c.number, 'client', cl.name,
    'entry_building', eb.name, 'current_building', ob.name,
    'amount', fe.amount, 'currency', fe.currency
  ) order by fe.amount desc), '[]'::jsonb)
  into v_building_drift
  from crm.finance_entries fe
  join crm.contract_payments cp on cp.id = fe.contract_payment_id
  join crm.contracts c on c.id = cp.contract_id
  left join crm.clients cl on cl.id = c.client_id
  join crm.objects o on o.id = c.object_id
  left join crm.buildings eb on eb.id = fe.building_id
  left join crm.buildings ob on ob.id = o.building_id
  where fe.building_id is distinct from o.building_id
  limit 20;

  -- Категории, чьё название (без учёта регистра и пробелов по краям)
  -- совпадает у двух и более строк одного типа -- почти всегда одна и та же
  -- статья, введённая дважды (например, до и после переключения языка).
  -- Системную категорию (code = 'contract_payments') сюда не берём -- её
  -- название переводится автоматически и не считается дублем.
  select coalesce(jsonb_agg(jsonb_build_object(
    'kind', kind, 'name', name, 'ids', ids, 'count', n
  ) order by n desc, name), '[]'::jsonb)
  into v_dup_categories
  from (
    select kind, min(name) as name, jsonb_agg(id order by created_at) as ids, count(*) as n
    from crm.finance_categories
    where code is null
    group by kind, lower(trim(name))
    having count(*) > 1
  ) d;

  return jsonb_build_object(
    'rollup_mismatch', v_mismatch, 'payments', v_payments,
    'gaps', v_gaps, 'building_drift', v_building_drift,
    'duplicate_categories', v_dup_categories
  );
end;
$$;

grant execute on function crm.finance_check() to authenticated;

-- Пересобирает здание у приходов-зеркалей по текущим данным квартиры их
-- договора. Ручные операции (без contract_payment_id) не трогает -- их
-- здание задаёт человек сам. Только администратор.
create or replace function crm.finance_resync_buildings()
returns integer
language plpgsql
security definer
set search_path = crm, public
as $$
declare
  v_count integer;
begin
  if auth.uid() is not null and not crm.is_admin() then
    raise exception 'Только администратор';
  end if;

  with upd as (
    update crm.finance_entries fe
    set building_id = sub.obj_building_id
    from (
      select cp.id as payment_id, o.building_id as obj_building_id
      from crm.contract_payments cp
      join crm.contracts c on c.id = cp.contract_id
      join crm.objects o on o.id = c.object_id
    ) sub
    where fe.contract_payment_id = sub.payment_id
      and fe.building_id is distinct from sub.obj_building_id
    returning 1
  )
  select count(*) into v_count from upd;

  return v_count;
end;
$$;

grant execute on function crm.finance_resync_buildings() to authenticated;

-- Оформляет недостающие платежи: разницу между «Оплачено» на договоре и
-- платежами превращает в настоящий платёж (датой подписания договора) -- то
-- же, что делает разовый блок 042 при запуске файла. Триггеры сами создадут
-- приход в финансах. Только администратор.
create or replace function crm.finance_repair_payment_gaps()
returns integer
language plpgsql
security definer
set search_path = crm, public
as $$
declare
  v_count integer;
begin
  if auth.uid() is not null and not crm.is_admin() then
    raise exception 'Только администратор';
  end if;
  with ins as (
    insert into crm.contract_payments (contract_id, due_date, amount, paid, paid_date)
    select c.id,
           coalesce(c.signed_date, c.created_at::date),
           c.paid_amount - coalesce(pp.total, 0),
           true,
           coalesce(c.signed_date, c.created_at::date)
    from crm.contracts c
    left join lateral (
      select sum(p.amount) as total from crm.contract_payments p
      where p.contract_id = c.id and p.paid
    ) pp on true
    where c.paid_amount - coalesce(pp.total, 0) > 0.005
    returning 1
  )
  select count(*) into v_count from ins;
  return v_count;
end;
$$;

grant execute on function crm.finance_repair_payment_gaps() to authenticated;

-- ### 072_merge_finance_categories.sql

-- ============================================================
-- 072: crm.finance_merge_category() -- a category typed twice (often the
-- same thing in slightly different words, or in both languages before the
-- "На русском"/"На таджикском" presets existed) can now be folded into
-- another one of the same kind: every crm.finance_entries row on it moves
-- to the survivor, then the duplicate itself is deleted.
--
-- Same shape as crm.merge_clients() (block 064) and for the same reason:
-- crm.finance_entries.category_id is "on delete restrict", so there is no
-- way to just delete a category once anything is booked against it.
--
-- p_into survives, p_from is folded into it and deleted. Admin-only, same
-- as merge_clients -- this permanently deletes a row and repoints every
-- entry that used it, a different order of consequence than the ordinary
-- can_manage_finance() gate rename/hide use. The system category (code =
-- 'contract_payments', the one the app files client payments under by
-- code, not by name) can be neither merged away nor merged into.
--
-- Идемпотентно в том смысле, что важен: вызов с уже удалённым p_from
-- просто завершится ошибкой, а не удалит что-то не то.
-- ============================================================

create or replace function crm.finance_merge_category(p_from uuid, p_into uuid)
returns integer
language plpgsql
security definer
set search_path = crm, public
as $$
declare
  v_from crm.finance_categories;
  v_into crm.finance_categories;
  v_count integer;
begin
  if crm.my_role() <> 'admin' then
    raise exception 'Только администратор может объединять категории';
  end if;
  if p_from = p_into then
    raise exception 'Нельзя объединить категорию саму с собой';
  end if;

  select * into v_from from crm.finance_categories where id = p_from;
  if not found then
    raise exception 'Категория не найдена';
  end if;
  select * into v_into from crm.finance_categories where id = p_into;
  if not found then
    raise exception 'Категория, в которую объединяют, не найдена';
  end if;
  if v_from.kind <> v_into.kind then
    raise exception 'Категории разных типов (приход/расход) нельзя объединить';
  end if;
  if v_from.code is not null or v_into.code is not null then
    raise exception 'Эту категорию использует сама программа, её нельзя объединять';
  end if;

  with upd as (
    update crm.finance_entries set category_id = p_into where category_id = p_from
    returning 1
  )
  select count(*) into v_count from upd;

  delete from crm.finance_categories where id = p_from;

  return v_count;
end;
$$;

grant execute on function crm.finance_merge_category(uuid, uuid) to authenticated;

-- ### 073_finance_no_default_categories.sql

-- ============================================================
-- 073: больше никаких стартовых статей прихода/расхода, кроме системной
-- «Оплата от клиентов».
--
-- ПОЧЕМУ. Блок 066 при каждом запуске этого файла досеивал 11 русских статей,
-- если статьи с ТАКИМ ЖЕ названием не находилось. Стоило одну переименовать
-- (кнопкой «На таджикском» или вручную) -- и при следующем запуске файла
-- русская снова появлялась рядом, а после следующего переключения языка
-- обе получали одно и то же имя («Маош» и «Маош»). Посев убран из 066.
--
-- ЧТО ДЕЛАЕТ ЭТОТ БЛОК -- один раз на установку (флаг в crm.settings, чтобы
-- следующий запуск файла не стёр статьи, которые компания заведёт сама):
-- удаляет стандартные статьи (по их русским и таджикским названиям), на
-- которые ещё НЕТ ни одной операции. Со статьями, где операции уже есть,
-- ничего не происходит -- их можно переименовать, скрыть или объединить в
-- настройках. Статьи со своими названиями и системная не трогаются.
--
-- Идемпотентно.
-- ============================================================

alter table crm.settings
  add column if not exists finance_defaults_cleared boolean not null default false;

do $clean$
declare
  v_deleted integer;
  v_left integer;
begin
  if exists (select 1 from crm.settings where id and not finance_defaults_cleared) then
    with del as (
      delete from crm.finance_categories c
      where c.code is null
        and c.name in (
          'Аренда', 'Прочий приход', 'Стройматериалы', 'Работы подрядчиков',
          'Зарплата', 'Техника и механизмы', 'Разрешения и проектные работы',
          'Коммунальные услуги', 'Налоги и сборы', 'Маркетинг', 'Прочий расход',
          'Иҷора', 'Даромади дигар', 'Маводи сохтмон', 'Корҳои пудратчиён',
          'Маош', 'Техника ва механизмҳо', 'Иҷозатномаҳо ва корҳои лоиҳавӣ',
          'Хизматрасонии коммуналӣ', 'Андоз ва боҷҳо', 'Хароҷоти дигар'
        )
        and not exists (select 1 from crm.finance_entries e where e.category_id = c.id)
      returning 1
    )
    select count(*) into v_deleted from del;

    select count(*) into v_left
    from crm.finance_categories c
    where c.code is null
      and c.name in (
        'Аренда', 'Прочий приход', 'Стройматериалы', 'Работы подрядчиков',
        'Зарплата', 'Техника и механизмы', 'Разрешения и проектные работы',
        'Коммунальные услуги', 'Налоги и сборы', 'Маркетинг', 'Прочий расход',
        'Иҷора', 'Даромади дигар', 'Маводи сохтмон', 'Корҳои пудратчиён',
        'Маош', 'Техника ва механизмҳо', 'Иҷозатномаҳо ва корҳои лоиҳавӣ',
        'Хизматрасонии коммуналӣ', 'Андоз ва боҷҳо', 'Хароҷоти дигар'
      );

    update crm.settings set finance_defaults_cleared = true where id;
    raise notice 'Стартовые статьи финансов: удалено % (без операций), оставлено % (с операциями)',
      v_deleted, v_left;
  end if;
end
$clean$;

-- ### 068_audit_noise_cleanup.sql

-- Раньше пересчёт графика платежей писал в журнал событий по записи на КАЖДУЮ
-- пересозданную строку графика (десятки одинаковых «Создан · Платёж» на один
-- договор, все в одну секунду, автор «Неизвестно»). Такие записи без автора
-- могли появиться только из SQL-редактора при обновлении базы -- из программы
-- у платежа всегда есть автор. Убираем их; теперь на договор одна запись
-- «график пересчитан».
delete from crm.audit_log
where actor_id is null
  and entity_type = 'contract_payment'
  and action in ('create', 'insert', 'delete');

-- ### 070_access_levels_hidden_menu.sql

-- ============================================================
-- 070: права доступа по разделам и скрытие пунктов меню.
--
-- ЗАЧЕМ. Роль (менеджер, бухгалтер, директор) раньше жёстко решала, что
-- человек видит: бухгалтер -- только финансы, менеджер -- только продажи.
-- Но бывает иначе: бухгалтеру нужно видеть продажи квартир, а
-- менеджеру по продажам -- финансы. Теперь у каждого сотрудника два
-- уровня доступа, и администратор может изменить любой из них:
--   * продажи квартир (клиенты, договоры, шахматка, объекты, задачи,
--     должники, аренда) и
--   * финансы;
-- значения: 'none' -- нет, 'read' -- только просмотр, 'write' -- полный.
-- Пока администратор ничего не менял (значение пустое), уровень берётся
-- по роли, ровно как было: менеджер -- продажи полный; директор -- всё
-- на просмотр; бухгалтер -- финансы полный; админ -- всё, и это нельзя
-- отнять. Смена роли сбрасывает индивидуальные уровни.
--
-- Замки прежние (RLS), просто has_role()/can_write()/can_view_finance()/
-- can_manage_finance() теперь читают уровни, а не роль напрямую.
--
-- Плюс: crm.settings.hidden_nav -- пункты бокового меню, которые админ
-- скрыл для всех (например «Задачи», пока они не нужны).
--
-- Идемпотентно -- повторный запуск ничего не ломает.
-- ============================================================

alter table crm.profiles add column if not exists sales_level text;
alter table crm.profiles add column if not exists finance_level text;

alter table crm.profiles drop constraint if exists profiles_sales_level_check;
alter table crm.profiles
  add constraint profiles_sales_level_check
  check (sales_level is null or sales_level in ('none', 'read', 'write'));
alter table crm.profiles drop constraint if exists profiles_finance_level_check;
alter table crm.profiles
  add constraint profiles_finance_level_check
  check (finance_level is null or finance_level in ('none', 'own', 'read', 'write'));

-- Эффективные уровни: индивидуальное значение, иначе значение по роли.
create or replace function crm.my_sales_level()
returns text
language sql
security definer
set search_path = crm, public
stable
as $$
  select case
    when crm.my_role() = 'admin' then 'write'
    else coalesce(
      (select p.sales_level from crm.profiles p where p.id = auth.uid()),
      case crm.my_role()
        when 'manager' then 'write'
        when 'director' then 'read'
        else 'none'
      end
    )
  end;
$$;

create or replace function crm.my_finance_level()
returns text
language sql
security definer
set search_path = crm, public
stable
as $$
  select case
    when crm.my_role() = 'admin' then 'write'
    else coalesce(
      (select p.finance_level from crm.profiles p where p.id = auth.uid()),
      case crm.my_role()
        when 'accountant' then 'write'
        when 'director' then 'read'
        else 'none'
      end
    )
  end;
$$;

grant execute on function crm.my_sales_level() to authenticated;
grant execute on function crm.my_finance_level() to authenticated;

-- Видит продажи (клиенты, договоры, квартиры, задачи...).
create or replace function crm.has_role()
returns boolean
language sql
security definer
set search_path = crm, public
stable
as $$
  select crm.my_sales_level() in ('read', 'write');
$$;

-- Меняет продажи (создаёт клиентов, договоры, принимает платежи...).
create or replace function crm.can_write()
returns boolean
language sql
security definer
set search_path = crm, public
stable
as $$
  select crm.my_sales_level() = 'write';
$$;

create or replace function crm.can_view_finance()
returns boolean
language sql
security definer
set search_path = crm, public
stable
as $$
  select crm.my_finance_level() in ('read', 'write');
$$;

create or replace function crm.can_manage_finance()
returns boolean
language sql
security definer
set search_path = crm, public
stable
as $$
  select crm.my_finance_level() = 'write';
$$;

-- Админ видит все здания; директор и бухгалтер -- все, но только если им открыт
-- хоть какой-то раздел (продажи или финансы); остальные -- назначенные.
create or replace function crm.can_view_building(p_building_id uuid)
returns boolean
language sql
security definer
set search_path = crm, public
stable
as $$
  select case
    when crm.my_role() = 'admin' then true
    when crm.my_role() in ('director', 'accountant') then crm.has_role() or crm.can_view_finance()
    else exists (
      select 1 from crm.manager_buildings mb
      where mb.user_id = auth.uid() and mb.building_id = p_building_id
    )
  end;
$$;

-- Названия зданий нужны и тем, кто видит финансы (для выбора здания и
-- отчётов), даже если продажи им закрыты; квартиры при этом остаются под
-- прежним замком (objects_select требует продажи).
drop policy if exists "buildings_select" on crm.buildings;
create policy "buildings_select" on crm.buildings
  for select to authenticated
  using (crm.can_view_building(id) or crm.can_view_finance());

-- Список сотрудников -- теперь с индивидуальными уровнями (пусто = по роли).
drop function if exists crm.list_staff();
create or replace function crm.list_staff()
returns table (
  id uuid, email text, role text, created_at timestamptz,
  sales_level text, finance_level text
)
language plpgsql
security definer
set search_path = crm, public
stable
as $$
begin
  if not crm.is_admin() then
    raise exception 'Только администратор может видеть список сотрудников';
  end if;
  return query
    select u.id,
           u.email::text,
           coalesce(p.role, 'none') as role,
           u.created_at,
           p.sales_level,
           p.finance_level
    from auth.users u
    left join crm.profiles p on p.id = u.id
    order by u.created_at asc;
end;
$$;

grant execute on function crm.list_staff() to authenticated;

-- Смена роли сбрасывает индивидуальные уровни: новая роль -- новые права
-- по умолчанию, а не остатки настроек от прежней.
create or replace function crm.set_user_role(p_user uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = crm, public
as $$
begin
  if not crm.is_admin() then
    raise exception 'Только администратор может менять роли';
  end if;
  if p_role not in ('admin', 'manager', 'director', 'accountant', 'none') then
    raise exception 'Неизвестная роль: %', p_role;
  end if;
  if p_user = auth.uid() and p_role <> 'admin' then
    raise exception 'Нельзя снять роль администратора с самого себя';
  end if;

  if p_role = 'none' then
    delete from crm.profiles where id = p_user;
  else
    insert into crm.profiles (id, role)
    values (p_user, p_role)
    on conflict (id) do update
      set role = excluded.role,
          sales_level = case when crm.profiles.role is distinct from excluded.role
                             then null else crm.profiles.sales_level end,
          finance_level = case when crm.profiles.role is distinct from excluded.role
                               then null else crm.profiles.finance_level end;
  end if;
end;
$$;

grant execute on function crm.set_user_role(uuid, text) to authenticated;

-- Индивидуальный доступ: пустая строка/null = «по роли».
create or replace function crm.set_user_access(p_user uuid, p_sales text, p_finance text)
returns void
language plpgsql
security definer
set search_path = crm, public
as $$
declare
  v_sales text := nullif(p_sales, '');
  v_finance text := nullif(p_finance, '');
begin
  if not crm.is_admin() then
    raise exception 'Только администратор может менять доступ';
  end if;
  if v_sales is not null and v_sales not in ('none', 'read', 'write') then
    raise exception 'Неизвестный уровень: %', v_sales;
  end if;
  if v_finance is not null and v_finance not in ('none', 'read', 'write') then
    raise exception 'Неизвестный уровень: %', v_finance;
  end if;

  update crm.profiles
  set sales_level = v_sales, finance_level = v_finance
  where id = p_user;
  if not found then
    raise exception 'У сотрудника ещё нет роли';
  end if;

  insert into crm.audit_log (actor_id, action, entity_type, entity_id, details)
  values (
    auth.uid(), 'update', 'staff_access', p_user,
    jsonb_build_object(
      'sales_level', coalesce(v_sales, 'role'),
      'finance_level', coalesce(v_finance, 'role')
    )
  );
end;
$$;

grant execute on function crm.set_user_access(uuid, text, text) to authenticated;

-- ---------- пункты меню, скрытые администратором ----------
alter table crm.settings add column if not exists hidden_nav text[] not null default '{}';

-- ### 074_procurement_advances.sql

-- ============================================================
-- 074: СНАБЖЕНЕЦ и ПОДОТЧЁТ.
--
-- ЗАЧЕМ. Человеку, который закупает материалы, выдают наличные «под отчёт»;
-- он тратит их и вводит расходы. Ему нужен свой узкий кабинет (свой баланс
-- и свои расходы, больше ничего), а компании -- видеть, сколько денег ушло
-- «на руки», кто и на что потратил, и чтобы деньги не задваивались.
--
-- ЧТО ДОБАВЛЯЕТ ЭТОТ БЛОК:
--   * роль 'procurement' (снабженец) и четвёртый уровень финансов 'own' --
--     «только свои расходы»: видит и вводит ТОЛЬКО расходы, которые ввёл сам;
--     ни прихода, ни чужих записей, ни итогов компании, ни зданий целиком;
--   * править и удалять свою запись можно только в день ввода (по времени
--     компании -- crm.settings.time_zone); на следующий день её правят только
--     бухгалтер и админ. Кто и когда ввёл запись, изменить нельзя никому;
--   * crm.finance_advances -- журнал выдач под отчёт (и возвратов -- со знаком
--     минус). Это НЕ приход и НЕ расход: деньги ещё не потрачены;
--   * личный баланс = выдано - потрачено (crm.finance_my_balance);
--   * баланс кассы компании (crm.finance_cash) = приход - расход - деньги,
--     выданные под отчёт и ещё не потраченные. Расход снабженца попадает в
--     обычные итоги по статьям и зданиям, но второй раз с кассы не списывается.
--
-- Идемпотентно.
-- ============================================================

-- ---------- часовой пояс компании: «день ввода» считается по нему ----------
alter table crm.settings add column if not exists time_zone text not null default 'Asia/Dushanbe';

create or replace function crm.finance_today()
returns date
language sql
security definer
set search_path = crm, public
stable
as $$
  select (now() at time zone coalesce((select s.time_zone from crm.settings s where s.id), 'Asia/Dushanbe'))::date;
$$;

grant execute on function crm.finance_today() to authenticated;

-- ---------- роль и уровень ----------
alter table crm.profiles drop constraint if exists profiles_role_check;
alter table crm.profiles
  add constraint profiles_role_check
  check (role in ('admin', 'manager', 'director', 'accountant', 'procurement'));

alter table crm.profiles drop constraint if exists profiles_finance_level_check;
alter table crm.profiles
  add constraint profiles_finance_level_check
  check (finance_level is null or finance_level in ('none', 'own', 'read', 'write'));

create or replace function crm.my_finance_level()
returns text
language sql
security definer
set search_path = crm, public
stable
as $$
  select case
    when crm.my_role() = 'admin' then 'write'
    else coalesce(
      (select p.finance_level from crm.profiles p where p.id = auth.uid()),
      case crm.my_role()
        when 'accountant' then 'write'
        when 'director' then 'read'
        when 'procurement' then 'own'
        else 'none'
      end
    )
  end;
$$;

-- «Только свои расходы»: не read и не write -- ни одна из прежних проверок
-- (can_view_finance / can_manage_finance) на него не срабатывает.
create or replace function crm.is_finance_own()
returns boolean
language sql
security definer
set search_path = crm, public
stable
as $$
  select crm.my_finance_level() = 'own';
$$;

grant execute on function crm.is_finance_own() to authenticated;

create or replace function crm.set_user_role(p_user uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = crm, public
as $$
begin
  if not crm.is_admin() then
    raise exception 'Только администратор может менять роли';
  end if;
  if p_role not in ('admin', 'manager', 'director', 'accountant', 'procurement', 'none') then
    raise exception 'Неизвестная роль: %', p_role;
  end if;
  if p_user = auth.uid() and p_role <> 'admin' then
    raise exception 'Нельзя снять роль администратора с самого себя';
  end if;

  if p_role = 'none' then
    delete from crm.profiles where id = p_user;
  else
    insert into crm.profiles (id, role)
    values (p_user, p_role)
    on conflict (id) do update
      set role = excluded.role,
          sales_level = case when crm.profiles.role is distinct from excluded.role
                             then null else crm.profiles.sales_level end,
          finance_level = case when crm.profiles.role is distinct from excluded.role
                               then null else crm.profiles.finance_level end;
  end if;
end;
$$;

grant execute on function crm.set_user_role(uuid, text) to authenticated;

create or replace function crm.set_user_access(p_user uuid, p_sales text, p_finance text)
returns void
language plpgsql
security definer
set search_path = crm, public
as $$
declare
  v_sales text := nullif(p_sales, '');
  v_finance text := nullif(p_finance, '');
begin
  if not crm.is_admin() then
    raise exception 'Только администратор может менять доступ';
  end if;
  if v_sales is not null and v_sales not in ('none', 'read', 'write') then
    raise exception 'Неизвестный уровень: %', v_sales;
  end if;
  if v_finance is not null and v_finance not in ('none', 'own', 'read', 'write') then
    raise exception 'Неизвестный уровень: %', v_finance;
  end if;

  update crm.profiles
  set sales_level = v_sales, finance_level = v_finance
  where id = p_user;
  if not found then
    raise exception 'У сотрудника ещё нет роли';
  end if;

  insert into crm.audit_log (actor_id, action, entity_type, entity_id, details)
  values (
    auth.uid(), 'update', 'staff_access', p_user,
    jsonb_build_object(
      'sales_level', coalesce(v_sales, 'role'),
      'finance_level', coalesce(v_finance, 'role')
    )
  );
end;
$$;

grant execute on function crm.set_user_access(uuid, text, text) to authenticated;

-- ---------- кто ввёл запись и в какой день ----------
alter table crm.finance_entries add column if not exists created_by_label text;
alter table crm.finance_entries add column if not exists entered_on date;

create index if not exists finance_entries_created_by_idx
  on crm.finance_entries (created_by, created_at desc);

-- Автор и день ввода ставит БАЗА, а не браузер, и после этого они не
-- меняются: ни снабженец, ни бухгалтер, ни админ не перепишут, кто и когда
-- внёс строку. (Старые строки остаются без подписи -- их не трогаем: массовая
-- правка задела бы итоги и журнал событий.)
create or replace function crm.finance_entries_stamp()
returns trigger
language plpgsql
security definer
set search_path = crm, public
as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.created_by := auth.uid();
    end if;
    new.entered_on := crm.finance_today();
    select u.email::text into new.created_by_label from auth.users u where u.id = new.created_by;
  else
    new.created_by := old.created_by;
    new.created_by_label := old.created_by_label;
    new.entered_on := old.entered_on;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

drop trigger if exists finance_entries_stamp on crm.finance_entries;
create trigger finance_entries_stamp
  before insert or update on crm.finance_entries
  for each row execute function crm.finance_entries_stamp();

-- ---------- журнал выдач под отчёт ----------
create table if not exists crm.finance_advances (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references auth.users(id) on delete restrict,
  -- выдача -- плюс; возврат остатка -- минус
  amount numeric not null check (amount <> 0),
  currency crm.currency not null default 'TJS',
  given_on date not null default crm.finance_today(),
  note text,
  given_by uuid,
  given_by_label text,
  created_at timestamptz not null default now()
);

create index if not exists finance_advances_person_idx
  on crm.finance_advances (person_id, given_on desc);

alter table crm.finance_advances enable row level security;

create or replace function crm.finance_advances_stamp()
returns trigger
language plpgsql
security definer
set search_path = crm, public
as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.given_by := auth.uid();
    end if;
    select u.email::text into new.given_by_label from auth.users u where u.id = new.given_by;
  else
    new.given_by := old.given_by;
    new.given_by_label := old.given_by_label;
    new.person_id := old.person_id;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

drop trigger if exists finance_advances_stamp on crm.finance_advances;
create trigger finance_advances_stamp
  before insert or update on crm.finance_advances
  for each row execute function crm.finance_advances_stamp();

-- Выдачи и возвраты попадают в журнал событий, как и ручные операции.
drop trigger if exists trg_audit_change_finance_advances on crm.finance_advances;
create trigger trg_audit_change_finance_advances
  after insert or update on crm.finance_advances
  for each row execute function crm.log_change('finance_advance');

drop trigger if exists trg_audit_delete_finance_advances on crm.finance_advances;
create trigger trg_audit_delete_finance_advances
  before delete on crm.finance_advances
  for each row execute function crm.log_delete('finance_advance');

drop policy if exists "finance_advances_select" on crm.finance_advances;
create policy "finance_advances_select" on crm.finance_advances
  for select to authenticated
  using (crm.can_view_finance() or (crm.is_finance_own() and person_id = auth.uid()));
drop policy if exists "finance_advances_insert" on crm.finance_advances;
create policy "finance_advances_insert" on crm.finance_advances
  for insert to authenticated with check (crm.can_manage_finance());
drop policy if exists "finance_advances_update" on crm.finance_advances;
create policy "finance_advances_update" on crm.finance_advances
  for update to authenticated
  using (crm.can_manage_finance()) with check (crm.can_manage_finance());
drop policy if exists "finance_advances_delete" on crm.finance_advances;
create policy "finance_advances_delete" on crm.finance_advances
  for delete to authenticated using (crm.can_manage_finance());

grant all on crm.finance_advances to authenticated;
grant all on crm.finance_advances to service_role;

-- ---------- замки на операциях: снабженец -- только своё ----------
drop policy if exists "finance_entries_select" on crm.finance_entries;
create policy "finance_entries_select" on crm.finance_entries
  for select to authenticated
  using (crm.can_view_finance() or (crm.is_finance_own() and created_by = auth.uid()));

drop policy if exists "finance_entries_insert" on crm.finance_entries;
create policy "finance_entries_insert" on crm.finance_entries
  for insert to authenticated
  with check (
    contract_payment_id is null
    and (crm.can_manage_finance() or (crm.is_finance_own() and kind = 'expense' and created_by = auth.uid()))
  );

drop policy if exists "finance_entries_update" on crm.finance_entries;
create policy "finance_entries_update" on crm.finance_entries
  for update to authenticated
  using (
    contract_payment_id is null
    and (crm.can_manage_finance()
         or (crm.is_finance_own() and created_by = auth.uid() and entered_on = crm.finance_today()))
  )
  with check (
    contract_payment_id is null
    and (crm.can_manage_finance()
         or (crm.is_finance_own() and kind = 'expense' and created_by = auth.uid()))
  );

drop policy if exists "finance_entries_delete" on crm.finance_entries;
create policy "finance_entries_delete" on crm.finance_entries
  for delete to authenticated
  using (
    contract_payment_id is null
    and (crm.can_manage_finance()
         or (crm.is_finance_own() and created_by = auth.uid() and entered_on = crm.finance_today()))
  );

-- Статьи нужны, чтобы выбрать при вводе (читать -- да, менять -- нет).
drop policy if exists "finance_categories_select" on crm.finance_categories;
create policy "finance_categories_select" on crm.finance_categories
  for select to authenticated
  using (crm.can_view_finance() or crm.is_finance_own());

-- Таблицу настроек снабженцу НЕ открываем (в ней ключ SMS). Название компании,
-- логотип и тема идут к нему через crm.public_branding() -- ту же маленькую
-- функцию, что показывает их на странице входа.

-- Здания целиком (адрес, цены за м²) снабженцу не открываются -- только
-- список «название + id», чтобы выбрать здание при вводе расхода.
create or replace function crm.finance_building_options()
returns table (id uuid, name text)
language plpgsql
stable
security definer
set search_path = crm, public
as $$
begin
  if not (crm.can_view_finance() or crm.is_finance_own()) then
    raise exception 'Недостаточно прав';
  end if;
  return query select b.id, b.name from crm.buildings b order by b.name;
end;
$$;

grant execute on function crm.finance_building_options() to authenticated;

-- ---------- личный баланс: выдано - потрачено ----------
create or replace function crm.finance_my_balance()
returns jsonb
language sql
stable
security definer
set search_path = crm, public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'currency', k.cur,
    'issued', coalesce(a.issued, 0),
    'spent', coalesce(s.spent, 0),
    'balance', coalesce(a.issued, 0) - coalesce(s.spent, 0)
  ) order by k.cur), '[]'::jsonb)
  from (
    select currency::text as cur from crm.finance_advances where person_id = auth.uid()
    union
    select currency::text from crm.finance_entries
    where created_by = auth.uid() and kind = 'expense' and contract_payment_id is null
  ) k
  left join (
    select currency::text as cur, sum(amount) as issued
    from crm.finance_advances where person_id = auth.uid() group by currency
  ) a on a.cur = k.cur
  left join (
    select currency::text as cur, sum(amount) as spent
    from crm.finance_entries
    where created_by = auth.uid() and kind = 'expense' and contract_payment_id is null
    group by currency
  ) s on s.cur = k.cur;
$$;

grant execute on function crm.finance_my_balance() to authenticated;

-- Те же цифры по каждому подотчётному -- для бухгалтера и админа (директор
-- -- только смотрит). В списке: у кого есть выдачи и те, кому открыт уровень
-- «только свои расходы».
create or replace function crm.finance_advance_people()
returns jsonb
language plpgsql
stable
security definer
set search_path = crm, public
as $$
begin
  if not crm.can_view_finance() then
    raise exception 'Недостаточно прав';
  end if;
  return coalesce((
    select jsonb_agg(p.j order by p.email)
    from (
      select u.email::text as email,
             jsonb_build_object(
               'id', u.id,
               'email', u.email,
               'balances', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'currency', k.cur,
                          'issued', coalesce(a.issued, 0),
                          'spent', coalesce(s.spent, 0),
                          'balance', coalesce(a.issued, 0) - coalesce(s.spent, 0)
                        ) order by k.cur)
                 from (
                   select currency::text as cur from crm.finance_advances where person_id = u.id
                   union
                   select currency::text from crm.finance_entries
                   where created_by = u.id and kind = 'expense' and contract_payment_id is null
                 ) k
                 left join (
                   select currency::text as cur, sum(amount) as issued
                   from crm.finance_advances where person_id = u.id group by currency
                 ) a on a.cur = k.cur
                 left join (
                   select currency::text as cur, sum(amount) as spent
                   from crm.finance_entries
                   where created_by = u.id and kind = 'expense' and contract_payment_id is null
                   group by currency
                 ) s on s.cur = k.cur
               ), '[]'::jsonb)
             ) as j
      from auth.users u
      where exists (select 1 from crm.finance_advances a where a.person_id = u.id)
         or exists (
           select 1 from crm.profiles pr
           where pr.id = u.id
             and coalesce(pr.finance_level, case pr.role when 'procurement' then 'own' end) = 'own'
         )
    ) p
  ), '[]'::jsonb);
end;
$$;

grant execute on function crm.finance_advance_people() to authenticated;

-- ---------- баланс кассы компании ----------
-- Приход - расход - деньги, выданные под отчёт и ещё не потраченные (у каждого
-- человека отдельно, не меньше нуля: перерасход -- это уже записанный расход).
-- Расходы подотчётных попадают в обычные итоги по статьям и зданиям, но с кассы
-- второй раз не списываются: она уменьшилась при выдаче. security invoker --
-- замок RLS (видят только те, кто видит финансы целиком).
create or replace function crm.finance_cash()
returns jsonb
language sql
stable
security invoker
set search_path = crm, public
as $$
with
net as (
  select currency::text as cur,
         coalesce(sum(total) filter (where kind = 'income'), 0)
           - coalesce(sum(total) filter (where kind = 'expense'), 0) as v
  from crm.finance_monthly
  group by currency
),
holders as (
  select person_id, currency::text as cur, sum(amount) as issued
  from crm.finance_advances
  group by person_id, currency
),
spent as (
  select e.created_by as person_id, e.currency::text as cur, sum(e.amount) as spent
  from crm.finance_entries e
  where e.kind = 'expense' and e.contract_payment_id is null
    and e.created_by in (select person_id from holders)
  group by e.created_by, e.currency
),
on_hand as (
  select h.cur, sum(greatest(h.issued - coalesce(s.spent, 0), 0)) as v
  from holders h
  left join spent s on s.person_id = h.person_id and s.cur = h.cur
  group by h.cur
),
cur as (
  select cur from net union select cur from on_hand
)
select coalesce(jsonb_agg(jsonb_build_object(
  'currency', c.cur,
  'value', coalesce(n.v, 0) - coalesce(o.v, 0),
  'on_hand', coalesce(o.v, 0)
) order by c.cur), '[]'::jsonb)
from cur c
left join net n on n.cur = c.cur
left join on_hand o on o.cur = c.cur;
$$;

grant execute on function crm.finance_cash() to authenticated;

-- ### 075_single_session.sql

-- ============================================================
-- 075: ОДИН АККАУНТ -- ОДНО УСТРОЙСТВО.
--
-- ЗАЧЕМ. Пароль или телефон с открытым сеансом могут оказаться у второго
-- человека; два устройства под одним аккаунтом -- это и есть такой случай.
-- Теперь вход с нового устройства завершает сеанс на прежнем («побеждает
-- последний вход»): потерянный телефон или забытый выход не блокируют
-- человека, но и параллельно под одним аккаунтом работать нельзя.
--
-- КАК. При входе устройство придумывает себе случайный токен и записывает его
-- сюда (crm.claim_session). Приложение каждые полминуты и при возвращении на
-- вкладку спрашивает crm.check_session(токен): 'ok' -- это устройство
-- актуальное; 'other' -- вошли с другого, надо выйти; 'none' -- записи ещё нет
-- (первый запуск после обновления), устройство занимает место. Таблицу
-- напрямую не читает никто -- только эти функции.
--
-- Выключатель: crm.settings.single_session (по умолчанию включено).
-- Идемпотентно.
-- ============================================================

alter table crm.settings add column if not exists single_session boolean not null default true;

create table if not exists crm.user_sessions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  token text not null,
  device text,
  started_at timestamptz not null default now(),
  last_seen timestamptz not null default now()
);

alter table crm.user_sessions enable row level security;
-- ни одной политики и никаких прямых прав: только через функции ниже
revoke all on crm.user_sessions from anon, authenticated;
grant all on crm.user_sessions to service_role;

create or replace function crm.claim_session(p_token text, p_device text default null)
returns void
language plpgsql
security definer
set search_path = crm, public
as $$
begin
  if auth.uid() is null then
    raise exception 'Нужно войти в систему';
  end if;
  if length(coalesce(p_token, '')) < 16 then
    raise exception 'Некорректный токен сеанса';
  end if;
  insert into crm.user_sessions (user_id, token, device)
  values (auth.uid(), p_token, left(p_device, 200))
  on conflict (user_id) do update
    set token = excluded.token, device = excluded.device,
        started_at = now(), last_seen = now();
end;
$$;

grant execute on function crm.claim_session(text, text) to authenticated;

-- 'ok' | 'other' | 'none' (см. выше). Если выключатель снят -- всегда 'ok'.
create or replace function crm.check_session(p_token text)
returns text
language plpgsql
security definer
set search_path = crm, public
as $$
declare
  v_token text;
  v_seen timestamptz;
begin
  if auth.uid() is null then
    return 'none';
  end if;
  if not coalesce((select s.single_session from crm.settings s where s.id), true) then
    return 'ok';
  end if;
  select token, last_seen into v_token, v_seen from crm.user_sessions where user_id = auth.uid();
  if v_token is null then
    return 'none';
  end if;
  if v_token = coalesce(p_token, '') then
    -- отметка «был на связи» -- не чаще раза в минуту, чтобы не писать зря
    if v_seen < now() - interval '1 minute' then
      update crm.user_sessions set last_seen = now() where user_id = auth.uid();
    end if;
    return 'ok';
  end if;
  return 'other';
end;
$$;

grant execute on function crm.check_session(text) to authenticated;

-- Где сейчас открыт каждый аккаунт -- для администратора (Настройки -> Доступ).
create or replace function crm.list_sessions()
returns table (user_id uuid, device text, started_at timestamptz, last_seen timestamptz)
language plpgsql
stable
security definer
set search_path = crm, public
as $$
begin
  if not crm.is_admin() then
    raise exception 'Только администратор';
  end if;
  return query select s.user_id, s.device, s.started_at, s.last_seen from crm.user_sessions s;
end;
$$;

grant execute on function crm.list_sessions() to authenticated;

-- ### 076_finance_person_ledger.sql

-- ============================================================
-- 076: ОДНА ЛЕНТА НА ЧЕЛОВЕКА -- выдачи и расходы вперемешку, по датам, с
-- кнопками «Выдать»/«Принять возврат» тут же (Финансы -> Подотчёт -> имя).
--
-- БЫСТРОДЕЙСТВИЕ ПРИ ЛЮБОМ ОБЪЁМЕ. У снабженца в месяц может быть тысячи
-- строк расхода -- нельзя просто "взять всё и отсортировать". Делаем то же,
-- что уже сделано для общего журнала (блок 067): курсорная пагинация по
-- индексу, а не смещение (offset), которое на большом объёме читает и
-- отбрасывает всё, что было раньше. Отдельно у выдач (crm.finance_advances,
-- их всегда мало) и отдельно у расходов ЭТОГО человека (не всей компании --
-- новый индекс ниже) берётся не больше p_limit строк каждым индексным
-- сканом, и только эти немногие строки сливаются и досортировываются.
-- Значит время ответа не растёт ни от того, сколько всего в базе записей за
-- всю историю компании, ни от того, сколько лет она уже работает -- растёт
-- только от того, сколько показывается на экране (по умолчанию 50).
--
-- Раздел никак не задевает Шахматку и остальные продажи: свои таблицы
-- (finance_entries/finance_advances), свои индексы, свои триггеры -- запись
-- расхода не трогает ни одной таблицы, которые читает Шахматка (objects/
-- contracts/buildings), и наоборот.
-- ============================================================

create index if not exists finance_entries_created_by_occurred_idx
  on crm.finance_entries (created_by, occurred_on desc, created_at desc);

-- p_before_id ломает связки: массовая вставка (импорт, наш же нагрузочный
-- тест) нередко даёт много строк с ОДИНАКОВЫМ created_at (now() внутри
-- одной транзакции не меняется), а courier без id как последнего критерия
-- сравнения на границе страницы такие связки тихо пропускал -- поймано
-- нагрузочным тестом на 60 000+ строк, не гипотетически.
create or replace function crm.finance_person_ledger(
  p_person_id uuid,
  p_before_date date default null,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null,
  p_limit integer default 50
)
returns jsonb
language sql
stable
security invoker
set search_path = crm, public
as $$
  with entries as (
    select
      e.id, 'expense'::text as kind, e.occurred_on as when_date, e.created_at,
      e.amount, e.currency::text as currency, e.title,
      c.name as category_name, c.code as category_code, b.name as building_name,
      e.quantity, e.unit, e.unit_price, e.note as note2,
      e.category_id, e.building_id, e.counterparty, e.contract_payment_id
    from crm.finance_entries e
    left join crm.finance_categories c on c.id = e.category_id
    left join crm.buildings b on b.id = e.building_id
    where e.created_by = p_person_id
      and (p_before_date is null
           or (e.occurred_on, e.created_at, e.id) < (p_before_date, p_before_created_at, p_before_id))
    order by e.occurred_on desc, e.created_at desc, e.id desc
    limit p_limit
  ),
  advances as (
    select
      a.id, (case when a.amount < 0 then 'return' else 'advance' end) as kind,
      a.given_on as when_date, a.created_at,
      abs(a.amount) as amount, a.currency::text as currency, a.note as title,
      null::text as category_name, null::text as category_code, null::text as building_name,
      null::numeric as quantity, null::text as unit, null::numeric as unit_price,
      a.given_by_label as note2,
      null::uuid as category_id, null::uuid as building_id, null::text as counterparty,
      null::uuid as contract_payment_id
    from crm.finance_advances a
    where a.person_id = p_person_id
      and (p_before_date is null
           or (a.given_on, a.created_at, a.id) < (p_before_date, p_before_created_at, p_before_id))
    order by a.given_on desc, a.created_at desc, a.id desc
    limit p_limit
  ),
  merged as (
    (select * from entries) union all (select * from advances)
    order by when_date desc, created_at desc, id desc
    limit p_limit
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'kind', kind, 'when_date', when_date, 'created_at', created_at,
    'amount', amount, 'currency', currency, 'title', title,
    'category_name', category_name, 'category_code', category_code,
    'building_name', building_name, 'quantity', quantity, 'unit', unit,
    'unit_price', unit_price, 'note', note2,
    'category_id', category_id, 'building_id', building_id,
    'counterparty', counterparty, 'contract_payment_id', contract_payment_id
  ) order by when_date desc, created_at desc, id desc), '[]'::jsonb)
  from merged;
$$;

grant execute on function crm.finance_person_ledger(uuid, date, timestamptz, uuid, integer) to authenticated;

-- ### 077_schedule_rebalance.sql

-- ============================================================
-- 077: график платежей больше не «ломается» от платежей; переплата сама
-- пересчитывает остаток; сдвинутые старым блоком 056 графики можно вернуть.
--
-- 1) ОТКЛЮЧЁН БЛОК 056 (см. его заголовок выше). Он при каждом запуске этого
--    файла стирал и пересоздавал график любого договора, по которому клиент
--    хоть раз платил после оформления, -- на весь срок от сегодняшнего дня.
--    Сроки уезжали вперёд, суммы менялись, просроченные пропадали из
--    «Должников».
--
-- 2) ПЕРЕПЛАТА. Раньше строки плана не пересчитывались никогда: если клиент
--    вместо 8 000 вносил 20 000, деньги просто «затекали» по очереди в
--    следующие строки, а сам график оставался как был -- и администратору
--    приходилось нажимать «Пересчитать график», который к тому же сбрасывал
--    срок на весь срок от сегодня. Теперь, если клиент опережает график БОЛЬШЕ
--    чем на один ближайший платёж, остаток распределяется ровными частями по
--    оставшимся будущим срокам (даты те же, конец договора не двигается).
--    Что НЕ пересчитывается: платёж ровно по графику (или на один платёж
--    вперёд), недоплата и просрочка -- долг остаётся долгом и виден в
--    «Должниках», его нельзя «растворить» в будущих месяцах.
--
-- 3) ВОССТАНОВЛЕНИЕ. crm.schedule_shifts() находит договоры, у которых по
--    датам самого договора просрочка была бы больше, чем сейчас (график уехал
--    вперёд), а crm.restore_schedule(id) пересобирает план от даты договора
--    (только администратор; прежний план сохраняется в crm.schedule_backup).
--
-- Идемпотентно.
-- ============================================================

-- ---------- запас: что было в плане до восстановления ----------
create table if not exists crm.schedule_backup (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null,
  due_date date not null,
  amount numeric not null,
  reason text not null,
  saved_at timestamptz not null default now()
);
create index if not exists schedule_backup_contract_idx on crm.schedule_backup (contract_id, saved_at desc);

alter table crm.schedule_backup enable row level security;
drop policy if exists "schedule_backup_select" on crm.schedule_backup;
create policy "schedule_backup_select" on crm.schedule_backup
  for select to authenticated using (crm.is_admin());
revoke all on crm.schedule_backup from anon;
grant select on crm.schedule_backup to authenticated;
grant all on crm.schedule_backup to service_role;

-- ---------- первоначальный график договора ----------
-- Каким он был при оформлении: n равных частей (последняя добирает копейки)
-- от даты договора, на сумму договора за вычетом первоначального взноса
-- (платежи, внесённые в день оформления или раньше). Ровно так его строит
-- форма бронирования. down возвращается в каждой строке -- для раскладки
-- поступлений по очереди (pool = оплачено - down).
create or replace function crm.contract_baseline_plan(p_contract_id uuid)
returns table (seq integer, due_date date, amount numeric, cum numeric, down numeric)
language sql
stable
security invoker
set search_path = crm, public
as $$
  with c as (
    select id, amount, installment_months as n,
           coalesce(signed_date, created_at::date) as d0
    from crm.contracts where id = p_contract_id and installment_months > 0
  ),
  dn as (
    select c.id, c.n, c.d0,
           least(coalesce(sum(p.amount), 0), c.amount) as down,
           c.amount - least(coalesce(sum(p.amount), 0), c.amount) as total
    from c
    left join crm.contract_payments p
      on p.contract_id = c.id and p.paid and coalesce(p.paid_date, p.due_date) <= c.d0
    group by c.id, c.n, c.d0, c.amount
  )
  select g.i,
         (dn.d0 + (g.i || ' month')::interval)::date,
         case when g.i < dn.n then floor(dn.total / dn.n * 100) / 100
              else round((dn.total - floor(dn.total / dn.n * 100) / 100 * (dn.n - 1)) * 100) / 100 end,
         case when g.i < dn.n then floor(dn.total / dn.n * 100) / 100 * g.i else dn.total end,
         dn.down
  from dn, generate_series(1, dn.n) g(i);
$$;

grant execute on function crm.contract_baseline_plan(uuid) to authenticated;

-- ---------- договоры, у которых график уехал вперёд ----------
-- (блок 083 меняет состав колонок этой функции, а create or replace этого не умеет --
-- поэтому перед каждым созданием она удаляется, иначе повторный запуск файла падал бы)
drop function if exists crm.schedule_shifts();
create function crm.schedule_shifts()
returns table (
  contract_id uuid,
  contract_number text,
  client_name text,
  currency text,
  overdue_now numeric,
  overdue_by_contract_date numeric
)
language sql
stable
security invoker
set search_path = crm, public
as $$
  with cand as (
    select c.id, c.number, c.currency::text as cur, c.paid_amount,
           coalesce(cl.name, '—') as client_name
    from crm.contracts c
    left join crm.clients cl on cl.id = c.client_id
    where c.payment_type in ('installment', 'rent')
      and c.status <> 'cancelled'
      and c.installment_months > 0
      and c.amount > c.paid_amount
      and exists (select 1 from crm.contract_payments p where p.contract_id = c.id and not p.paid)
  ),
  restored as (
    select cd.id,
           coalesce(sum(
             least(b.amount, greatest(b.cum - greatest(cd.paid_amount - b.down, 0), 0))
           ) filter (where b.due_date < current_date), 0) as overdue
    from cand cd
    cross join lateral crm.contract_baseline_plan(cd.id) b
    group by cd.id
  ),
  now_ as (
    select oi.contract_id as id, sum(oi.unpaid_amount) as overdue
    from crm.overdue_installments oi
    where oi.due_date < current_date and oi.unpaid_amount > 0.005
    group by oi.contract_id
  )
  select cd.id, cd.number, cd.client_name, cd.cur,
         coalesce(n.overdue, 0), r.overdue
  from cand cd
  join restored r on r.id = cd.id
  left join now_ n on n.id = cd.id
  where r.overdue > coalesce(n.overdue, 0) + 0.5
  order by r.overdue - coalesce(n.overdue, 0) desc, cd.id;
$$;

grant execute on function crm.schedule_shifts() to authenticated;

create or replace function crm.restore_schedule(p_contract_id uuid)
returns integer
language plpgsql
security definer
set search_path = crm, public
as $$
declare
  c crm.contracts;
  v_rows integer;
begin
  if not crm.is_admin() then
    raise exception 'Только администратор может восстановить график';
  end if;
  select * into c from crm.contracts where id = p_contract_id;
  if not found then
    raise exception 'Contract not found';
  end if;
  if c.payment_type not in ('installment', 'rent') or coalesce(c.installment_months, 0) < 1 then
    raise exception 'У договора нет графика рассрочки';
  end if;
  if c.amount <= c.paid_amount then
    raise exception 'Nothing left to schedule';
  end if;

  perform set_config('crm.audit_off', 'on', true);

  insert into crm.schedule_backup (contract_id, due_date, amount, reason)
  select contract_id, due_date, amount, 'restore_schedule'
  from crm.contract_payments where contract_id = p_contract_id and not paid;

  delete from crm.contract_payments where contract_id = p_contract_id and not paid;

  insert into crm.contract_payments (contract_id, due_date, amount, paid, paid_date)
  select p_contract_id, b.due_date, b.amount, false, null
  from crm.contract_baseline_plan(p_contract_id) b;
  get diagnostics v_rows = row_count;

  perform set_config('crm.audit_off', 'off', true);

  insert into crm.audit_log (actor_id, action, entity_type, entity_id, details)
  values (
    auth.uid(), 'update', 'contract', p_contract_id,
    jsonb_build_object(
      'schedule_restored', true,
      'schedule_payments', v_rows,
      '_context', crm.audit_context('contract', p_contract_id)
    )
  );
  return v_rows;
end;
$$;

grant execute on function crm.restore_schedule(uuid) to authenticated;

-- ---------- переплата пересчитывает остаток ----------
create or replace function crm.rebalance_schedule_after_payment()
returns trigger
language plpgsql
security definer
set search_path = crm, public
as $$
declare
  c crm.contracts;
  v_paid numeric;
  v_plan_total numeric;
  v_pool numeric;
  v_due_total numeric;
  v_next numeric;
  v_remaining numeric;
  v_dates date[];
  v_n integer;
  v_base numeric;
  v_amount numeric;
  i integer;
begin
  select * into c from crm.contracts where id = new.contract_id;
  if not found or c.status = 'cancelled' or c.payment_type not in ('installment', 'rent') then
    return null;
  end if;

  select coalesce(sum(amount) filter (where paid), 0),
         coalesce(sum(amount) filter (where not paid), 0)
    into v_paid, v_plan_total
  from crm.contract_payments where contract_id = c.id;

  v_remaining := c.amount - v_paid;
  if v_remaining <= 0.005 or v_plan_total <= 0 then
    return null;
  end if;

  -- Сколько поступившего легло на план (по очереди, от старых строк к новым).
  v_pool := greatest(v_paid - (c.amount - v_plan_total), 0);

  select coalesce(sum(amount), 0) into v_due_total
  from crm.contract_payments
  where contract_id = c.id and not paid and due_date <= current_date;

  select amount into v_next
  from crm.contract_payments
  where contract_id = c.id and not paid and due_date > current_date
  order by due_date, id limit 1;

  -- Нет будущих строк -- пересчитывать не на что; и пока клиент не опередил
  -- график больше чем на один ближайший платёж -- график остаётся как есть.
  if v_next is null or v_pool - v_due_total - v_next <= 0.5 then
    return null;
  end if;

  select array_agg(due_date order by due_date, id), count(*)::int
    into v_dates, v_n
  from crm.contract_payments
  where contract_id = c.id and not paid and due_date > current_date;

  -- Перестройка -- одно действие, а не 2N записей в журнале.
  perform set_config('crm.audit_off', 'on', true);

  delete from crm.contract_payments where contract_id = c.id and not paid;

  v_base := floor(v_remaining / v_n * 100) / 100;
  for i in 1..v_n loop
    if i = v_n then
      v_amount := round((v_remaining - v_base * (v_n - 1)) * 100) / 100;
    else
      v_amount := v_base;
    end if;
    insert into crm.contract_payments (contract_id, due_date, amount, paid, paid_date)
    values (c.id, v_dates[i], v_amount, false, null);
  end loop;

  perform set_config('crm.audit_off', 'off', true);

  insert into crm.audit_log (actor_id, action, entity_type, entity_id, details)
  values (
    auth.uid(), 'update', 'contract', c.id,
    jsonb_build_object(
      'schedule_rebalanced', true,
      'schedule_payments', v_n,
      'schedule_remaining', v_remaining,
      '_context', crm.audit_context('contract', c.id)
    )
  );
  return null;
end;
$$;

drop trigger if exists trg_rebalance_after_payment on crm.contract_payments;
create trigger trg_rebalance_after_payment
after insert on crm.contract_payments
for each row when (new.paid)
execute function crm.rebalance_schedule_after_payment();

-- ---------- ручной пересчёт: тот же замок по зданию, что у приёма платежа ----------
-- Кнопка «Пересчитать график» теперь доступна и менеджеру. Право на запись
-- проверялось и раньше, но не то, что договор -- из ЖК, который менеджеру открыт.
create or replace function crm.regenerate_schedule(
  p_contract_id uuid,
  p_months integer
)
returns integer
language plpgsql
security definer
set search_path = crm, public
as $$
declare
  v_contract crm.contracts;
  v_remaining numeric;
  v_base numeric;
  v_amount numeric;
  i integer;
begin
  if not crm.can_write() then
    raise exception 'Read-only role';
  end if;
  if p_months is null or p_months < 1 then
    raise exception 'Months must be at least 1';
  end if;

  select * into v_contract from crm.contracts where id = p_contract_id;
  if not found then
    raise exception 'Contract not found';
  end if;
  if not exists (
    select 1 from crm.objects o
    where o.id = v_contract.object_id
      and (o.building_id is null or crm.can_view_building(o.building_id))
  ) then
    raise exception 'Contract not allowed for this user';
  end if;

  v_remaining := greatest(v_contract.amount - v_contract.paid_amount, 0);
  if v_remaining <= 0 then
    raise exception 'Nothing left to schedule';
  end if;

  perform set_config('crm.audit_off', 'on', true);

  delete from crm.contract_payments
  where contract_id = p_contract_id and paid = false;

  v_base := floor(v_remaining / p_months * 100) / 100;
  for i in 1..p_months loop
    if i = p_months then
      v_amount := round((v_remaining - v_base * (p_months - 1)) * 100) / 100;
    else
      v_amount := v_base;
    end if;
    insert into crm.contract_payments (contract_id, due_date, amount, paid, paid_date)
    values (p_contract_id, (current_date + (i || ' month')::interval)::date, v_amount, false, null);
  end loop;

  perform set_config('crm.audit_off', 'off', true);

  insert into crm.audit_log (actor_id, action, entity_type, entity_id, details)
  values (
    auth.uid(), 'update', 'contract', p_contract_id,
    jsonb_build_object(
      'schedule_payments', p_months,
      'schedule_remaining', v_remaining,
      '_context', crm.audit_context('contract', p_contract_id)
    )
  );

  update crm.contracts
  set installment_months = p_months
  where id = p_contract_id;

  return p_months;
end;
$$;

grant execute on function crm.regenerate_schedule(uuid, integer) to authenticated;

-- ### 078_finance_spend_guard.sql

-- ============================================================
-- 078: ФИНАНСЫ -- расход и выдача под отчёт не уходят «в минус»; движение денег.
--
-- ЗАЧЕМ. До сих пор расход можно было записать при любом балансе: касса
-- или остаток у подотчётного тихо уходили в минус, и отчёт показывал деньги,
-- которых нет. Теперь база сама не принимает такую запись -- ни у бухгалтера
-- и админа, ни у снабженца, с любого устройства и любым способом ввода.
--
-- КАКОЙ БАЛАНС ПРОВЕРЯЕТСЯ (по каждой валюте отдельно, сомони и доллары не
-- смешиваются):
--   * расход вводит снабженец (или вообще тот, кому что-то выдавали под
--     отчёт) -- смотрим его личный баланс: выдано - потрачено (то же, что в
--     crm.finance_my_balance). Деньги из кассы уже ушли при выдаче;
--   * расход вводит бухгалтер/админ -- смотрим кассу компании (то же число,
--     что crm.finance_cash: приход - расход - деньги на руках у подотчётных);
--   * выдача под отчёт (+) -- не больше кассы; возврат (-) -- не больше того,
--     что сейчас на руках у человека.
-- Запись больше баланса отклоняется с понятным текстом; запись на всю сумму
-- баланса проходит (остаётся ровно ноль). Правка суммы вверх проверяется на
-- РАЗНИЦУ; правка вниз, смена даты, названия, заметки, удаление -- никогда не
-- блокируются (деньги должно быть можно исправить). Приход не проверяется
-- вообще -- именно приход выводит кассу из нуля.
--
-- Проверка стоит только для сеансов пользователей (auth.uid() не пусто):
-- служебные задания и SQL-редактор (загрузка/исправление данных) мимо неё.
-- Параллельные записи одного баланса идут по очереди (advisory-замок), поэтому
-- два одновременных расхода не пройдут оба «на последние деньги».
--
-- ЧТО ДОБАВЛЯЕТ БЛОК:
--   * crm.finance_cash_value(валюта), crm.finance_person_balance(человек,
--     валюта), crm.finance_is_holder(человек, валюта) -- те же формулы, что у
--     crm.finance_cash / crm.finance_my_balance, но для проверки в триггерах;
--   * триггеры finance_entries_zz_guard и finance_advances_zz_guard (имена с
--     «zz», чтобы сработать ПОСЛЕ расчёта итога и проставления автора);
--   * crm.finance_available() -- «сколько можно потратить» для экранов
--     (по каждой валюте и по тому балансу, который проверяется);
--   * crm.finance_cashflow(от, до) -- движение денег по месяцам: приход,
--     расход, выдано под отчёт и остаток кассы на конец месяца (график
--     «Денежный поток»).
--
-- Идемпотентно. Существующие записи НЕ трогаются: если баланс уже в минусе,
-- новые расходы просто не принимаются, пока не поступит приход.
-- ============================================================

-- ---------- те же формулы, что в crm.finance_cash / crm.finance_my_balance ----------
-- VOLATILE on purpose (no "stable"): a multi-row INSERT fires this for row 2
-- after row 1 is already in the table, and only a volatile function sees it. The
-- sum is taken over the entries themselves, not the monthly summary, because that
-- summary is updated after the whole statement -- a batch of expenses sent in one
-- request could otherwise each pass "on the last money" together.
create or replace function crm.finance_cash_value(p_currency crm.currency)
returns numeric
language sql
volatile
security definer
set search_path = crm, public
as $$
  select
    coalesce((
      select coalesce(sum(e.amount) filter (where e.kind = 'income'), 0)
           - coalesce(sum(e.amount) filter (where e.kind = 'expense'), 0)
      from crm.finance_entries e where e.currency = p_currency
    ), 0)
    - coalesce((
      select sum(greatest(h.issued - coalesce(s.spent, 0), 0))
      from (
        select a.person_id, sum(a.amount) as issued
        from crm.finance_advances a where a.currency = p_currency group by a.person_id
      ) h
      left join (
        select e.created_by as person_id, sum(e.amount) as spent
        from crm.finance_entries e
        where e.kind = 'expense' and e.contract_payment_id is null and e.currency = p_currency
          and e.created_by in (select a2.person_id from crm.finance_advances a2 where a2.currency = p_currency)
        group by e.created_by
      ) s on s.person_id = h.person_id
    ), 0);
$$;

create or replace function crm.finance_person_balance(p_person uuid, p_currency crm.currency)
returns numeric
language sql
volatile
security definer
set search_path = crm, public
as $$
  select
    coalesce((select sum(a.amount) from crm.finance_advances a
              where a.person_id = p_person and a.currency = p_currency), 0)
    - coalesce((select sum(e.amount) from crm.finance_entries e
                where e.created_by = p_person and e.kind = 'expense'
                  and e.contract_payment_id is null and e.currency = p_currency), 0);
$$;

-- Тратит ли человек свои деньги «на руках» (а не кассу компании): ему открыт
-- уровень «только свои расходы» (кроме админа) либо ему выдавали деньги под
-- отчёт в этой валюте.
create or replace function crm.finance_is_holder(p_person uuid, p_currency crm.currency)
returns boolean
language sql
volatile
security definer
set search_path = crm, public
as $$
  select exists (
           select 1 from crm.finance_advances a
           where a.person_id = p_person and a.currency = p_currency
         )
      or coalesce((
           select pr.role <> 'admin'
              and coalesce(pr.finance_level, case when pr.role = 'procurement' then 'own' end) = 'own'
           from crm.profiles pr where pr.id = p_person
         ), false);
$$;

-- ---------- замок на расходе ----------
create or replace function crm.finance_entries_guard()
returns trigger
language plpgsql
security definer
set search_path = crm, public
as $$
declare
  v_need numeric;
  v_have numeric;
  v_personal boolean;
begin
  if auth.uid() is null then
    return new;                              -- служебные задания, SQL-редактор
  end if;
  if new.kind <> 'expense' or new.contract_payment_id is not null then
    return new;                              -- приход выводит кассу из нуля
  end if;

  -- Правка вверх проверяется на разницу; во всех остальных случаях (новая
  -- запись, смена валюты или вида) -- на всю сумму.
  if tg_op = 'UPDATE' and old.kind = 'expense' and old.currency = new.currency
     and old.created_by is not distinct from new.created_by then
    v_need := new.amount - old.amount;
  else
    v_need := new.amount;
  end if;
  if v_need <= 0.005 then
    return new;
  end if;

  v_personal := crm.finance_is_holder(new.created_by, new.currency);
  if v_personal then
    perform pg_advisory_xact_lock(hashtextextended('finance:person:' || new.created_by::text || ':' || new.currency::text, 0));
    v_have := crm.finance_person_balance(new.created_by, new.currency);
  else
    perform pg_advisory_xact_lock(hashtextextended('finance:company:' || new.currency::text, 0));
    v_have := crm.finance_cash_value(new.currency);
  end if;

  if v_need > v_have + 0.005 then
    raise exception using
      errcode = 'P0001',
      message = case when v_personal
        then format('Недостаточно денег на руках: доступно %s %s, расход %s %s',
                    round(greatest(v_have, 0), 2), new.currency, round(v_need, 2), new.currency)
        else format('Недостаточно денег в кассе: доступно %s %s, расход %s %s',
                    round(greatest(v_have, 0), 2), new.currency, round(v_need, 2), new.currency)
      end,
      hint = 'no_funds',
      detail = jsonb_build_object(
        'op', 'expense',
        'scope', case when v_personal then 'personal' else 'company' end,
        'currency', new.currency,
        'available', round(greatest(v_have, 0), 2),
        'requested', round(v_need, 2)
      )::text;
  end if;
  return new;
end;
$$;

drop trigger if exists finance_entries_zz_guard on crm.finance_entries;
create trigger finance_entries_zz_guard
  before insert or update on crm.finance_entries
  for each row execute function crm.finance_entries_guard();

-- ---------- замок на выдаче и возврате под отчёт ----------
create or replace function crm.finance_advances_guard()
returns trigger
language plpgsql
security definer
set search_path = crm, public
as $$
declare
  v_need numeric;
  v_have numeric;
  v_give boolean := new.amount > 0;
begin
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.currency = new.currency and old.person_id = new.person_id
     and sign(old.amount) = sign(new.amount) then
    v_need := abs(new.amount) - abs(old.amount);
  else
    v_need := abs(new.amount);
  end if;
  if v_need <= 0.005 then
    return new;
  end if;

  if v_give then
    perform pg_advisory_xact_lock(hashtextextended('finance:company:' || new.currency::text, 0));
    v_have := crm.finance_cash_value(new.currency);
  else
    perform pg_advisory_xact_lock(hashtextextended('finance:person:' || new.person_id::text || ':' || new.currency::text, 0));
    v_have := crm.finance_person_balance(new.person_id, new.currency);
  end if;

  if v_need > v_have + 0.005 then
    raise exception using
      errcode = 'P0001',
      message = case when v_give
        then format('Недостаточно денег в кассе для выдачи: доступно %s %s, выдача %s %s',
                    round(greatest(v_have, 0), 2), new.currency, round(v_need, 2), new.currency)
        else format('Нельзя вернуть больше, чем на руках: у человека %s %s, возврат %s %s',
                    round(greatest(v_have, 0), 2), new.currency, round(v_need, 2), new.currency)
      end,
      hint = 'no_funds',
      detail = jsonb_build_object(
        'op', case when v_give then 'give' else 'return' end,
        'scope', case when v_give then 'company' else 'personal' end,
        'currency', new.currency,
        'available', round(greatest(v_have, 0), 2),
        'requested', round(v_need, 2)
      )::text;
  end if;
  return new;
end;
$$;

drop trigger if exists finance_advances_zz_guard on crm.finance_advances;
create trigger finance_advances_zz_guard
  before insert or update on crm.finance_advances
  for each row execute function crm.finance_advances_guard();

-- ---------- «сколько можно потратить» для экранов ----------
-- По каждой валюте -- тот баланс, который проверит замок: у снабженца свой
-- (scope = personal), у бухгалтера и админа касса (scope = company). Остальным
-- (директор и т.д.) -- пусто: вводить им нечего.
create or replace function crm.finance_available()
returns jsonb
language plpgsql
stable
security definer
set search_path = crm, public
as $$
declare
  v_uid uuid := auth.uid();
  v_out jsonb := '[]'::jsonb;
  c crm.currency;
  v_personal boolean;
begin
  if v_uid is null or not (crm.can_manage_finance() or crm.is_finance_own()) then
    return '[]'::jsonb;
  end if;
  foreach c in array enum_range(null::crm.currency) loop
    v_personal := crm.finance_is_holder(v_uid, c);
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'currency', c,
      'scope', case when v_personal then 'personal' else 'company' end,
      'available', case when v_personal then crm.finance_person_balance(v_uid, c)
                        else crm.finance_cash_value(c) end,
      -- the till itself, for issuing money under report (only those who manage finance)
      'cash', case when crm.can_manage_finance() then crm.finance_cash_value(c) end
    ));
  end loop;
  return v_out;
end;
$$;

grant execute on function crm.finance_available() to authenticated;

-- ---------- движение денег по месяцам ----------
-- Приход и расход берутся из сводки по месяцам (быстро, без сырых строк);
-- «выдано под отчёт» -- чистая выдача за месяц (выдачи минус возвраты);
-- остаток кассы на конец месяца считается тем же правилом, что crm.finance_cash:
-- накопленный (приход - расход) минус деньги на руках у подотчётных на ту дату.
-- Касса общая на компанию, поэтому здесь нет фильтра по зданию. security
-- invoker: замок -- RLS (видят только те, кто видит финансы целиком).
create or replace function crm.finance_cashflow(p_from date, p_to date)
returns jsonb
language sql
stable
security invoker
set search_path = crm, public
as $$
-- Every piece the later steps look up repeatedly is MATERIALIZED: left to be inlined,
-- the spending-by-person scan of the entries ran again for every month x person and
-- the report took 17 s on a year of data instead of a fraction of a second.
with
months as materialized (
  select g::date as month
  from generate_series(date_trunc('month', p_from)::date, date_trunc('month', p_to)::date, interval '1 month') g
),
cur as materialized (
  select unnest(enum_range(null::crm.currency)) as currency
),
grid as materialized (
  select mo.month, c.currency from months mo cross join cur c
),
flow as materialized (
  select m.month, m.currency,
         coalesce(sum(m.total) filter (where m.kind = 'income'), 0) as income,
         coalesce(sum(m.total) filter (where m.kind = 'expense'), 0) as expense
  from crm.finance_monthly m
  group by m.month, m.currency
),
adv as materialized (
  select a.person_id, date_trunc('month', a.given_on)::date as month, a.currency, sum(a.amount) as amt
  from crm.finance_advances a
  group by 1, 2, 3
),
people as materialized (
  select distinct person_id from crm.finance_advances
),
spent as materialized (
  select e.created_by as person_id, date_trunc('month', e.occurred_on)::date as month,
         e.currency, sum(e.amount) as amt
  from crm.finance_entries e
  where e.kind = 'expense' and e.contract_payment_id is null
    and e.created_by in (select person_id from people)
  group by 1, 2, 3
),
net as materialized (
  select g.month, g.currency,
         coalesce((select sum(f2.income - f2.expense) from flow f2
                   where f2.currency = g.currency and f2.month <= g.month), 0) as net
  from grid g
),
held as materialized (
  select g.month, g.currency,
         coalesce(sum(greatest(b.bal, 0)), 0) as on_hand
  from grid g
  left join lateral (
    select p.person_id,
           coalesce((select sum(a2.amt) from adv a2
                     where a2.person_id = p.person_id and a2.currency = g.currency and a2.month <= g.month), 0)
         - coalesce((select sum(s2.amt) from spent s2
                     where s2.person_id = p.person_id and s2.currency = g.currency and s2.month <= g.month), 0) as bal
    from people p
  ) b on true
  group by g.month, g.currency
),
series as (
  select g.month, g.currency,
         coalesce(f.income, 0) as income,
         coalesce(f.expense, 0) as expense,
         coalesce((select sum(a3.amt) from adv a3 where a3.month = g.month and a3.currency = g.currency), 0) as advances,
         n.net - h.on_hand as cash_end
  from grid g
  left join flow f on f.month = g.month and f.currency = g.currency
  join net n on n.month = g.month and n.currency = g.currency
  join held h on h.month = g.month and h.currency = g.currency
)
select coalesce(jsonb_agg(jsonb_build_object(
  'month', to_char(month, 'YYYY-MM'),
  'currency', currency,
  'income', income,
  'expense', expense,
  'advances', advances,
  'cash_end', cash_end
) order by month, currency), '[]'::jsonb)
from series;
$$;

grant execute on function crm.finance_cashflow(date, date) to authenticated;

-- ---------- служебные функции замка не вызываются снаружи ----------
-- Postgres по умолчанию даёт EXECUTE всем (PUBLIC), а через PostgREST любая
-- такая функция становится вызываемой по ключу anon: без этого REVOKE любой
-- посетитель сайта мог бы спросить кассу компании или остаток любого человека.
-- Триггеры и crm.finance_available() вызывают их от имени владельца
-- (security definer), так что замок продолжает работать.
revoke all on function crm.finance_cash_value(crm.currency) from public, anon, authenticated;
revoke all on function crm.finance_person_balance(uuid, crm.currency) from public, anon, authenticated;
revoke all on function crm.finance_is_holder(uuid, crm.currency) from public, anon, authenticated;
revoke all on function crm.finance_entries_guard() from public, anon, authenticated;
revoke all on function crm.finance_advances_guard() from public, anon, authenticated;

-- ---------- сверка: остатки ушли в минус ----------
-- Замок выше не пускает НОВЫЙ расход сверх баланса, но то, что накопилось до
-- него (расходы без прихода, перерасход подотчётных), остаётся в данных. Эта
-- сверка называет такие места -- кассу в минусе и людей, потративших больше,
-- чем им выдали, -- чтобы они не прятались за общей цифрой. Ничего не меняет.
create or replace function crm.finance_balance_check()
returns jsonb
language plpgsql
stable
security definer
set search_path = crm, public
as $$
begin
  if auth.uid() is not null and not crm.can_view_finance() then
    raise exception 'Недостаточно прав';
  end if;
  return jsonb_build_object(
    'negative_cash', coalesce((
      select jsonb_agg(jsonb_build_object('currency', x.c, 'value', x.v) order by x.c)
      from (
        select cur.c, crm.finance_cash_value(cur.c) as v
        from (select unnest(enum_range(null::crm.currency)) as c) cur
      ) x
      where x.v < -0.005
    ), '[]'::jsonb),
    'overspent', coalesce((
      select jsonb_agg(jsonb_build_object('email', y.email, 'currency', y.currency, 'balance', y.balance)
                       order by y.email, y.currency)
      from (
        select u.email::text as email, cur.c as currency, crm.finance_person_balance(u.id, cur.c) as balance
        from auth.users u
        cross join (select unnest(enum_range(null::crm.currency)) as c) cur
        where exists (select 1 from crm.finance_advances a where a.person_id = u.id)
           or exists (
             select 1 from crm.profiles pr
             where pr.id = u.id and pr.role <> 'admin'
               and coalesce(pr.finance_level, case when pr.role = 'procurement' then 'own' end) = 'own'
           )
      ) y
      where y.balance < -0.005
    ), '[]'::jsonb)
  );
end;
$$;

grant execute on function crm.finance_balance_check() to authenticated;

-- ### 079_overdue_contracts_object_id.sql

-- ============================================================
-- 079: crm.overdue_contracts() отдаёт ещё и id квартиры (object_id).
--
-- ЗАЧЕМ. Список для обзвона (PDF со страницы «Должники») должен нести данные
-- о квартире: номер, этаж, площадь. Номер квартиры нигде не хранится -- он
-- вычисляется по положению квартиры в сетке здания, а для этого нужно знать,
-- КАКАЯ именно квартира у договора. Названия квартиры («Кв 12») для этого мало:
-- оно не уникально и не обязано совпадать с номером.
--
-- DROP нужен по той же причине, что и в блоке 045: меняется состав колонок,
-- а `create or replace` этого не умеет. Остальное -- без изменений: те же
-- правила просрочки, тот же порядок, security invoker (права -- как у вызывающего).
-- Идемпотентно, данные не трогает.
-- ============================================================

drop function if exists crm.overdue_contracts(uuid);
create function crm.overdue_contracts(p_building_id uuid default null)
returns table (
  contract_id uuid,
  contract_number text,
  client_id uuid,
  client_name text,
  client_phone text,
  object_id uuid,
  object_name text,
  building_id uuid,
  building_name text,
  currency text,
  missed_count int,
  total_overdue numeric,
  remaining_total numeric,
  earliest_due date,
  latest_due date
)
language sql
stable
security invoker
set search_path = crm, public
as $$
  select
    c.id,
    c.number,
    cl.id,
    coalesce(cl.name, '—'),
    cl.phone,
    o.id,
    o.name,
    o.building_id,
    b.name,
    c.currency::text,
    (count(*))::int,
    sum(oi.unpaid_amount),
    greatest(c.amount - c.paid_amount, 0),
    min(oi.due_date),
    max(oi.due_date)
  from crm.overdue_installments oi
  join crm.contracts c on c.id = oi.contract_id
  left join crm.clients   cl on cl.id = c.client_id
  left join crm.objects   o  on o.id = c.object_id
  left join crm.buildings b  on b.id = o.building_id
  where oi.due_date < current_date
    and oi.unpaid_amount > 0.005
    and (p_building_id is null or o.building_id = p_building_id)
  group by c.id, c.number, cl.id, cl.name, cl.phone, o.id, o.name, o.building_id, b.name,
           c.currency, c.amount, c.paid_amount
  order by sum(oi.unpaid_amount) desc, c.id;
$$;

grant execute on function crm.overdue_contracts(uuid) to authenticated;

-- ### 080_advances_breakdown_and_ledger_filter.sql

-- ============================================================
-- 080: ПОДОТЧЁТ -- видно отдельно «выдано», «возвращено», «потрачено», «на руках»,
-- и ленту человека можно сузить до одних выдач/возвратов или одних расходов.
--
-- ЗАЧЕМ. На карточке сотрудника было одно «Выдано X · потрачено Y», а X --
-- чистая сумма: возвраты в неё уже вычтены, так что вернуть деньги значило
-- «выдать меньше», и разницы между «выдавали меньше» и «вернул» не было видно.
-- А чтобы увидеть историю именно выдач, приходилось листать ленту, где они
-- идут вперемешку с сотнями расходов.
--
--   * crm.finance_advance_people() -- в каждой валюте добавлены given (сколько
--     выдано, без вычета возвратов) и returned (сколько вернул). Остальные поля
--     не тронуты: старый экран продолжает работать.
--   * crm.finance_person_ledger(..., p_kind) -- p_kind = 'advances' (выдачи и
--     возвраты), 'expenses' (расходы) или не задан (всё вместе). Постраничность
--     та же, по курсору: фильтр просто не читает ненужный источник.
--
-- DROP нужен для ленты: у функции появляется параметр, и `create or replace` с
-- другой сигнатурой создал бы вторую перегрузку -- вызов по именам стал бы
-- неоднозначным. Данных не трогает; идемпотентно.
-- ============================================================

create or replace function crm.finance_advance_people()
returns jsonb
language plpgsql
stable
security definer
set search_path = crm, public
as $$
begin
  if not crm.can_view_finance() then
    raise exception 'Недостаточно прав';
  end if;
  return coalesce((
    select jsonb_agg(p.j order by p.email)
    from (
      select u.email::text as email,
             jsonb_build_object(
               'id', u.id,
               'email', u.email,
               'balances', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'currency', k.cur,
                          'issued', coalesce(a.issued, 0),
                          'given', coalesce(a.given, 0),
                          'returned', coalesce(a.returned, 0),
                          'spent', coalesce(s.spent, 0),
                          'balance', coalesce(a.issued, 0) - coalesce(s.spent, 0)
                        ) order by k.cur)
                 from (
                   select currency::text as cur from crm.finance_advances where person_id = u.id
                   union
                   select currency::text from crm.finance_entries
                   where created_by = u.id and kind = 'expense' and contract_payment_id is null
                 ) k
                 left join (
                   select currency::text as cur,
                          sum(amount) as issued,
                          coalesce(sum(amount) filter (where amount > 0), 0) as given,
                          coalesce(-sum(amount) filter (where amount < 0), 0) as returned
                   from crm.finance_advances where person_id = u.id group by currency
                 ) a on a.cur = k.cur
                 left join (
                   select currency::text as cur, sum(amount) as spent
                   from crm.finance_entries
                   where created_by = u.id and kind = 'expense' and contract_payment_id is null
                   group by currency
                 ) s on s.cur = k.cur
               ), '[]'::jsonb)
             ) as j
      from auth.users u
      where exists (select 1 from crm.finance_advances a where a.person_id = u.id)
         or exists (
           select 1 from crm.profiles pr
           where pr.id = u.id
             and coalesce(pr.finance_level, case pr.role when 'procurement' then 'own' end) = 'own'
         )
    ) p
  ), '[]'::jsonb);
end;
$$;

grant execute on function crm.finance_advance_people() to authenticated;

drop function if exists crm.finance_person_ledger(uuid, date, timestamptz, uuid, integer);
drop function if exists crm.finance_person_ledger(uuid, date, timestamptz, uuid, integer, text);
create function crm.finance_person_ledger(
  p_person_id uuid,
  p_before_date date default null,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null,
  p_limit integer default 50,
  p_kind text default null
)
returns jsonb
language sql
stable
security invoker
set search_path = crm, public
as $$
  with entries as (
    select
      e.id, 'expense'::text as kind, e.occurred_on as when_date, e.created_at,
      e.amount, e.currency::text as currency, e.title,
      c.name as category_name, c.code as category_code, b.name as building_name,
      e.quantity, e.unit, e.unit_price, e.note as note2,
      e.category_id, e.building_id, e.counterparty, e.contract_payment_id
    from crm.finance_entries e
    left join crm.finance_categories c on c.id = e.category_id
    left join crm.buildings b on b.id = e.building_id
    where p_kind is distinct from 'advances'
      and e.created_by = p_person_id
      and (p_before_date is null
           or (e.occurred_on, e.created_at, e.id) < (p_before_date, p_before_created_at, p_before_id))
    order by e.occurred_on desc, e.created_at desc, e.id desc
    limit p_limit
  ),
  advances as (
    select
      a.id, (case when a.amount < 0 then 'return' else 'advance' end) as kind,
      a.given_on as when_date, a.created_at,
      abs(a.amount) as amount, a.currency::text as currency, a.note as title,
      null::text as category_name, null::text as category_code, null::text as building_name,
      null::numeric as quantity, null::text as unit, null::numeric as unit_price,
      a.given_by_label as note2,
      null::uuid as category_id, null::uuid as building_id, null::text as counterparty,
      null::uuid as contract_payment_id
    from crm.finance_advances a
    where p_kind is distinct from 'expenses'
      and a.person_id = p_person_id
      and (p_before_date is null
           or (a.given_on, a.created_at, a.id) < (p_before_date, p_before_created_at, p_before_id))
    order by a.given_on desc, a.created_at desc, a.id desc
    limit p_limit
  ),
  merged as (
    (select * from entries) union all (select * from advances)
    order by when_date desc, created_at desc, id desc
    limit p_limit
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'kind', kind, 'when_date', when_date, 'created_at', created_at,
    'amount', amount, 'currency', currency, 'title', title,
    'category_name', category_name, 'category_code', category_code,
    'building_name', building_name, 'quantity', quantity, 'unit', unit,
    'unit_price', unit_price, 'note', note2,
    'category_id', category_id, 'building_id', building_id,
    'counterparty', counterparty, 'contract_payment_id', contract_payment_id
  ) order by when_date desc, created_at desc, id desc), '[]'::jsonb)
  from merged;
$$;

grant execute on function crm.finance_person_ledger(uuid, date, timestamptz, uuid, integer, text) to authenticated;

-- ############################################################
-- ### 081_debtors_rework.sql
-- ############################################################

-- ============================================================
-- 081: «Должники» -- где квартира, когда платил в последний раз,
--      сколько платит в месяц; и «К оплате в этом месяце».
--
-- 1. crm.overdue_contracts() отдаёт ещё и:
--      * object_id / object_block / object_floor -- по ним интерфейс
--        собирает «подъезд, этаж, квартира» (номер квартиры нигде не
--        хранится, он считается по сетке дома -- см. apartmentNumbers.ts);
--      * last_payment_date -- дата последнего РЕАЛЬНОГО поступления
--        (строка contract_payments с paid = true). Это «сколько времени
--        клиент не платит» в целом, а не возраст отдельной просроченной
--        строки графика: тот скачет каждый месяц и ничего не говорит о
--        том, давно ли человек вообще платил. Если платежей не было
--        совсем -- NULL;
--      * monthly_payment -- обычный ежемесячный платёж по графику. Берётся
--        медиана сумм строк графика, а не «последняя» или «средняя»: у
--        графика последняя строка отличается на копейки (остаток
--        округления), а вручную добавленная разовая строка не должна
--        сдвигать «обычный» платёж.
--    У функции меняется состав колонок, поэтому она пересоздаётся через
--    drop (create or replace тут вернул бы «cannot change return type»).
--    Дата последнего платежа и обычный платёж считаются ОДНИМ проходом по
--    платежам должников (а не двумя подзапросами на каждого), и функция без
--    SET search_path -- под RLS это в разы быстрее.
--
-- 2. crm.due_this_month_contracts() -- по каждому договору: сколько
--    запланировано на текущий календарный месяц и сколько из этого ещё не
--    закрыто деньгами. Раскладка поступлений -- та же, что у просрочки
--    (представление crm.overdue_installments): деньги закрывают самые
--    старые строки первыми, поэтому долг прошлых месяцев не «съедает»
--    платёж этого месяца -- он учитывается в просрочке, а здесь только то,
--    что клиент должен внести именно в этом месяце.
--
-- 3. crm.due_this_month_totals() -- то же, но итогом по валютам: карточка
--    на дашборде. p_active_only повторяет правило дашборда: без выбранного
--    ЖК достроенные дома в сводку не входят.
--
-- Файл идемпотентный -- можно запускать повторно.
-- ============================================================

-- ---- 1. Должники ----

drop function if exists crm.overdue_contracts(uuid);
create function crm.overdue_contracts(p_building_id uuid default null)
returns table (
  contract_id uuid,
  contract_number text,
  client_id uuid,
  client_name text,
  client_phone text,
  object_id uuid,
  object_name text,
  object_block text,
  object_floor integer,
  building_id uuid,
  building_name text,
  currency text,
  missed_count int,
  total_overdue numeric,
  remaining_total numeric,
  earliest_due date,
  latest_due date,
  last_payment_date date,
  monthly_payment numeric
)
language sql
stable
security invoker
as $$
  with od as (
    select oi.contract_id,
           (count(*))::int as missed,
           sum(oi.unpaid_amount) as overdue,
           min(oi.due_date) as earliest_due,
           max(oi.due_date) as latest_due
    from crm.overdue_installments oi
    where oi.due_date < current_date
      and oi.unpaid_amount > 0.005
    group by oi.contract_id
  ),
  pay as (
    select p.contract_id,
           -- дата последнего РЕАЛЬНОГО поступления (строка с paid = true)
           max(coalesce(p.paid_date, p.due_date)) filter (where p.paid) as last_payment_date,
           -- обычный ежемесячный платёж: медиана неоплаченных строк графика
           percentile_disc(0.5) within group (order by p.amount) filter (where not p.paid) as monthly_payment
    from crm.contract_payments p
    where p.contract_id in (select od.contract_id from od)
    group by p.contract_id
  )
  select
    c.id,
    c.number,
    cl.id,
    coalesce(cl.name, '—'),
    cl.phone,
    o.id,
    o.name,
    o.block,
    o.floor,
    o.building_id,
    b.name,
    c.currency::text,
    od.missed,
    od.overdue,
    greatest(c.amount - c.paid_amount, 0),
    od.earliest_due,
    od.latest_due,
    pay.last_payment_date,
    pay.monthly_payment
  from od
  join crm.contracts c on c.id = od.contract_id
  left join crm.clients   cl on cl.id = c.client_id
  left join crm.objects   o  on o.id = c.object_id
  left join crm.buildings b  on b.id = o.building_id
  left join pay on pay.contract_id = od.contract_id
  where p_building_id is null or o.building_id = p_building_id
  order by od.overdue desc, c.id;
$$;

grant execute on function crm.overdue_contracts(uuid) to authenticated;


-- ---- 2. К оплате в этом месяце: по договорам ----

drop function if exists crm.due_this_month_contracts(uuid);
create function crm.due_this_month_contracts(p_building_id uuid default null)
returns table (
  contract_id uuid,
  contract_number text,
  client_id uuid,
  client_name text,
  client_phone text,
  object_id uuid,
  object_name text,
  object_block text,
  object_floor integer,
  building_id uuid,
  building_name text,
  currency text,
  scheduled_amount numeric,
  unpaid_amount numeric
)
language sql
stable
security invoker
set search_path = crm, public
as $$
  select
    c.id,
    c.number,
    cl.id,
    coalesce(cl.name, '—'),
    cl.phone,
    o.id,
    o.name,
    o.block,
    o.floor,
    o.building_id,
    coalesce(b.name, '—'),
    c.currency::text,
    sum(oi.scheduled_amount),
    sum(oi.unpaid_amount)
  from crm.overdue_installments oi
  join crm.contracts c on c.id = oi.contract_id
  left join crm.clients   cl on cl.id = c.client_id
  left join crm.objects   o  on o.id = c.object_id
  left join crm.buildings b  on b.id = o.building_id
  where oi.due_date >= date_trunc('month', current_date)::date
    and oi.due_date <  (date_trunc('month', current_date) + interval '1 month')::date
    and (p_building_id is null or o.building_id = p_building_id)
  group by c.id, c.number, cl.id, cl.name, cl.phone,
           o.id, o.name, o.block, o.floor, o.building_id, b.name,
           c.currency
  order by sum(oi.unpaid_amount) desc, c.id;
$$;

grant execute on function crm.due_this_month_contracts(uuid) to authenticated;


-- ---- 3. К оплате в этом месяце: итог по валютам (дашборд) ----

drop function if exists crm.due_this_month_totals(uuid, boolean);
create function crm.due_this_month_totals(
  p_building_id uuid default null,
  p_active_only boolean default false
)
returns table (
  currency text,
  contracts int,
  unpaid_contracts int,
  scheduled_total numeric,
  unpaid_total numeric
)
language sql
stable
security invoker
set search_path = crm, public
as $$
  with per_contract as (
    select
      c.id,
      c.currency::text          as currency,
      sum(oi.scheduled_amount)  as scheduled,
      sum(oi.unpaid_amount)     as unpaid
    from crm.overdue_installments oi
    join crm.contracts c on c.id = oi.contract_id
    left join crm.objects   o on o.id = c.object_id
    left join crm.buildings b on b.id = o.building_id
    where oi.due_date >= date_trunc('month', current_date)::date
      and oi.due_date <  (date_trunc('month', current_date) + interval '1 month')::date
      and (p_building_id is null or o.building_id = p_building_id)
      -- Как на дашборде: в общей сводке достроенный ЖК не участвует,
      -- а если выбран конкретный дом -- показывается как есть.
      and (
        p_building_id is not null
        or not p_active_only
        or coalesce(b.construction_status, 'in_progress') <> 'completed'
      )
    group by c.id, c.currency
  )
  select
    pc.currency,
    (count(*))::int,
    (count(*) filter (where pc.unpaid > 0.005))::int,
    sum(pc.scheduled),
    sum(pc.unpaid)
  from per_contract pc
  group by pc.currency
  order by sum(pc.unpaid) desc;
$$;

grant execute on function crm.due_this_month_totals(uuid, boolean) to authenticated;

-- PostgREST узнаёт о новых колонках/функциях по сигналу.
notify pgrst, 'reload schema';


notify pgrst, 'reload schema';

-- ############################################################
-- ### 082_faster_access_checks.sql
-- ############################################################

-- ============================================================
-- 082: «Должники» и отчёты по просрочке снова укладываются в лимит времени
--      («canceling statement due to statement timeout»).
--
-- ЧТО БЫЛО НЕ ТАК. Просрочка читает ВСЕ строки графика, а каждая строка
-- проходила проверку прав (RLS) отдельным вызовом нескольких функций:
-- «есть ли у человека роль», «из его ли ЖК эта квартира». После блока 070
-- (уровни доступа) каждая такая проверка стала ещё и многоступенчатой
-- (уровень -> роль -> профиль). На десятках тысяч строк графика это давало
-- десятки секунд против разрешённых нескольких, и страница «Должники» писала
-- «не удалось загрузить список».
--
-- ЧТО ИЗМЕНЕНО (права доступа те же, меняется только способ проверки):
--  1. my_sales_level() / my_finance_level() -- один запрос к профилю вместо
--     цепочки вложенных вызовов;
--  2. my_building_scope() -- ЧТО видит человек, считается ОДИН РАЗ на запрос:
--     'all' (админ; директор и бухгалтер с открытым разделом), 'assigned'
--     (остальные -- только назначенные ЖК), 'none';
--  3. политики чтения клиентов, квартир, договоров и платежей используют это
--     значение как константу запроса (select ...), а не считают его заново для
--     каждой строки. Кто что видит -- прежнее (проверено по ролям и
--     индивидуальным уровням);
--  4. crm.contract_baseline_plan() -- без SET, чтобы планировщик мог встроить её
--     в запрос (на ней стоит проверка «сдвинутых графиков»).
--
-- Идемпотентно, данные не трогает.
-- ============================================================

create or replace function crm.my_sales_level()
returns text
language sql
security definer
set search_path = crm, public
stable
as $$
  select coalesce(
    (select case p.role
        when 'admin' then 'write'
        else coalesce(
          p.sales_level,
          case p.role when 'manager' then 'write' when 'director' then 'read' else 'none' end
        )
      end
     from crm.profiles p where p.id = auth.uid()),
    'none');
$$;

create or replace function crm.my_finance_level()
returns text
language sql
security definer
set search_path = crm, public
stable
as $$
  select coalesce(
    (select case p.role
        when 'admin' then 'write'
        else coalesce(
          p.finance_level,
          case p.role when 'accountant' then 'write' when 'director' then 'read' when 'procurement' then 'own' else 'none' end
        )
      end
     from crm.profiles p where p.id = auth.uid()),
    'none');
$$;

-- Какие здания видит человек: 'all' / 'assigned' (назначенные ему ЖК) / 'none'.
-- То же правило, что в crm.can_view_building(), но для всех зданий сразу.
create or replace function crm.my_building_scope()
returns text
language sql
security definer
set search_path = crm, public
stable
as $$
  select coalesce(
    (select case
        when p.role = 'admin' then 'all'
        when p.role in ('director', 'accountant') then
          case when crm.has_role() or crm.can_view_finance() then 'all' else 'none' end
        else 'assigned'
      end
     from crm.profiles p where p.id = auth.uid()),
    'none');
$$;

grant execute on function crm.my_building_scope() to authenticated;

-- Политики чтения: константы запроса считаются один раз.
drop policy if exists "clients_select" on crm.clients;
create policy "clients_select" on crm.clients
  for select to authenticated
  using ((select crm.has_role()));

drop policy if exists "objects_select" on crm.objects;
create policy "objects_select" on crm.objects
  for select to authenticated
  using (
    (select crm.has_role())
    and (
      building_id is null
      or (select crm.my_building_scope()) = 'all'
      or ((select crm.my_building_scope()) = 'assigned'
          and building_id in (select mb.building_id from crm.manager_buildings mb
                              where mb.user_id = (select auth.uid())))
    )
  );

drop policy if exists "contracts_select" on crm.contracts;
create policy "contracts_select" on crm.contracts
  for select to authenticated
  using (
    (select crm.has_role())
    and exists (
      select 1 from crm.objects o
      where o.id = contracts.object_id
        and (
          o.building_id is null
          or (select crm.my_building_scope()) = 'all'
          or ((select crm.my_building_scope()) = 'assigned'
              and o.building_id in (select mb.building_id from crm.manager_buildings mb
                                    where mb.user_id = (select auth.uid())))
        )
    )
  );

drop policy if exists "contract_payments_select" on crm.contract_payments;
create policy "contract_payments_select" on crm.contract_payments
  for select to authenticated
  using (
    (select crm.has_role())
    and exists (
      select 1
      from crm.contracts c
      join crm.objects o on o.id = c.object_id
      where c.id = contract_payments.contract_id
        and (
          o.building_id is null
          or (select crm.my_building_scope()) = 'all'
          or ((select crm.my_building_scope()) = 'assigned'
              and o.building_id in (select mb.building_id from crm.manager_buildings mb
                                    where mb.user_id = (select auth.uid())))
        )
    )
  );

-- Без SET search_path (все имена и так с префиксом crm.), чтобы функцию можно
-- было встроить в запрос.
create or replace function crm.contract_baseline_plan(p_contract_id uuid)
returns table (seq integer, due_date date, amount numeric, cum numeric, down numeric)
language sql
stable
security invoker
as $$
  with c as (
    select id, amount, installment_months as n,
           coalesce(signed_date, created_at::date) as d0
    from crm.contracts where id = p_contract_id and installment_months > 0
  ),
  dn as (
    select c.id, c.n, c.d0,
           least(coalesce(sum(p.amount), 0), c.amount) as down,
           c.amount - least(coalesce(sum(p.amount), 0), c.amount) as total
    from c
    left join crm.contract_payments p
      on p.contract_id = c.id and p.paid and coalesce(p.paid_date, p.due_date) <= c.d0
    group by c.id, c.n, c.d0, c.amount
  )
  select g.i,
         (dn.d0 + (g.i || ' month')::interval)::date,
         case when g.i < dn.n then floor(dn.total / dn.n * 100) / 100
              else round((dn.total - floor(dn.total / dn.n * 100) / 100 * (dn.n - 1)) * 100) / 100 end,
         case when g.i < dn.n then floor(dn.total / dn.n * 100) / 100 * g.i else dn.total end,
         dn.down
  from dn, generate_series(1, dn.n) g(i);
$$;

grant execute on function crm.contract_baseline_plan(uuid) to authenticated;

notify pgrst, 'reload schema';


notify pgrst, 'reload schema';

-- ############################################################
-- ### 083_schedule_shift_review.sql
-- ############################################################

-- ============================================================
-- 083: карточка «График сдвинут вперёд» -- можно решить по каждому договору.
--
-- Карточка (блок 077) находит договоры, у которых по датам самого договора
-- просрочка была бы больше, чем сейчас. Но такая разница бывает не только от
-- старого блока 056: график могли ПЕРЕНЕСТИ сознательно (договорённость с
-- клиентом, кнопка «Пересчитать график», смена суммы договора -- всё это
-- честно начинает график заново). «Вернуть график» таким договорам выдумало бы
-- долг, которого нет. Поэтому:
--
--  1. crm.schedule_shifts() теперь отдаёт и сведения для решения: дату
--     договора, срок, сумму, сколько оплачено, с какой даты график идёт сейчас
--     и клиента (для ссылки);
--  2. crm.dismiss_schedule_shift(id) -- «оставить как есть»: договор больше не
--     попадает в карточку (запоминается в crm.schedule_shift_dismissed, только
--     администратор, пишется в журнал);
--  3. crm.undo_restore_schedule(id) -- отменить возврат графика: прежний план
--     берётся из crm.schedule_backup и ставится на место (только администратор).
--
-- Идемпотентно, данные договоров сама не меняет.
-- ============================================================

create table if not exists crm.schedule_shift_dismissed (
  contract_id uuid primary key references crm.contracts(id) on delete cascade,
  dismissed_by uuid,
  dismissed_at timestamptz not null default now()
);

alter table crm.schedule_shift_dismissed enable row level security;
drop policy if exists "schedule_shift_dismissed_select" on crm.schedule_shift_dismissed;
create policy "schedule_shift_dismissed_select" on crm.schedule_shift_dismissed
  for select to authenticated using (crm.is_admin());
revoke all on crm.schedule_shift_dismissed from anon;
grant select on crm.schedule_shift_dismissed to authenticated;
grant all on crm.schedule_shift_dismissed to service_role;

-- Состав колонок изменился -- create or replace не умеет, поэтому drop.
--
-- Без SET search_path: все имена в запросе с префиксом crm., а с SET функция,
-- читающая таблицы под RLS, работала в разы медленнее (проверено: 9 с против 1 с).
drop function if exists crm.schedule_shifts();
create function crm.schedule_shifts()
returns table (
  contract_id uuid,
  contract_number text,
  client_id uuid,
  client_name text,
  currency text,
  signed_date date,
  installment_months integer,
  contract_amount numeric,
  paid_amount numeric,
  next_plan_date date,
  overdue_now numeric,
  overdue_by_contract_date numeric
)
language sql
stable
security invoker

as $$
  with cand as (
    select c.id, c.number, c.currency::text as cur, c.paid_amount, c.amount,
           c.client_id, c.installment_months as months,
           coalesce(c.signed_date, c.created_at::date) as signed,
           coalesce(cl.name, '—') as client_name
    from crm.contracts c
    left join crm.clients cl on cl.id = c.client_id
    where c.payment_type in ('installment', 'rent')
      and c.status <> 'cancelled'
      and c.installment_months > 0
      and c.amount > c.paid_amount
      and exists (select 1 from crm.contract_payments p where p.contract_id = c.id and not p.paid)
      and not exists (select 1 from crm.schedule_shift_dismissed d where d.contract_id = c.id)
  ),
  -- Money received on the day of signing or earlier = the initial payment: it is not
  -- part of the instalment plan (same rule as crm.contract_baseline_plan).
  base as (
    select cd.id, cd.months, cd.signed, cd.paid_amount,
           cd.amount - least(coalesce(sum(p.amount) filter (
             where p.paid and coalesce(p.paid_date, p.due_date) <= cd.signed), 0), cd.amount) as total,
           least(coalesce(sum(p.amount) filter (
             where p.paid and coalesce(p.paid_date, p.due_date) <= cd.signed), 0), cd.amount) as down
    from cand cd
    left join crm.contract_payments p on p.contract_id = cd.id
    group by cd.id, cd.months, cd.signed, cd.paid_amount, cd.amount
  ),
  -- The plan as it was at signing: n equal parts (the last one takes the cents), month by month
  -- from the contract date. Pure arithmetic -- no table is read here.
  plan as (
    select b.id, b.paid_amount, b.down,
           (b.signed + (g.i || ' month')::interval)::date as due,
           case when g.i < b.months then floor(b.total / b.months * 100) / 100
                else round((b.total - floor(b.total / b.months * 100) / 100 * (b.months - 1)) * 100) / 100 end as amt,
           case when g.i < b.months then floor(b.total / b.months * 100) / 100 * g.i else b.total end as cum
    from base b
    cross join lateral generate_series(1, b.months) g(i)
  ),
  restored as (
    select pl.id,
           coalesce(sum(
             least(pl.amt, greatest(pl.cum - greatest(pl.paid_amount - pl.down, 0), 0))
           ) filter (where pl.due < current_date), 0) as overdue
    from plan pl
    group by pl.id
  ),
  now_ as (
    select oi.contract_id as id, sum(oi.unpaid_amount) as overdue
    from crm.overdue_installments oi
    where oi.due_date < current_date and oi.unpaid_amount > 0.005
    group by oi.contract_id
  ),
  nxt as (
    select p.contract_id as id, min(p.due_date) as next_date
    from crm.contract_payments p
    where not p.paid and p.contract_id in (select id from cand)
    group by p.contract_id
  )
  select cd.id, cd.number, cd.client_id, cd.client_name, cd.cur,
         cd.signed, cd.months, cd.amount, cd.paid_amount, nxt.next_date,
         coalesce(n.overdue, 0), r.overdue
  from cand cd
  join restored r on r.id = cd.id
  left join now_ n on n.id = cd.id
  left join nxt on nxt.id = cd.id
  where r.overdue > coalesce(n.overdue, 0) + 0.5
  order by r.overdue - coalesce(n.overdue, 0) desc, cd.id;
$$;

grant execute on function crm.schedule_shifts() to authenticated;

-- «Оставить как есть»: график перенесён сознательно, из карточки убрать.
create or replace function crm.dismiss_schedule_shift(p_contract_id uuid)
returns void
language plpgsql
security definer
set search_path = crm, public
as $$
begin
  if not crm.is_admin() then
    raise exception 'Только администратор может скрыть договор из этой карточки';
  end if;
  if not exists (select 1 from crm.contracts where id = p_contract_id) then
    raise exception 'Contract not found';
  end if;

  insert into crm.schedule_shift_dismissed (contract_id, dismissed_by)
  values (p_contract_id, auth.uid())
  on conflict (contract_id) do nothing;

  insert into crm.audit_log (actor_id, action, entity_type, entity_id, details)
  values (
    auth.uid(), 'update', 'contract', p_contract_id,
    jsonb_build_object(
      'schedule_shift_dismissed', true,
      '_context', crm.audit_context('contract', p_contract_id)
    )
  );
end;
$$;

grant execute on function crm.dismiss_schedule_shift(uuid) to authenticated;

-- Отменить возврат графика: последний сохранённый план ставится на место.
create or replace function crm.undo_restore_schedule(p_contract_id uuid)
returns integer
language plpgsql
security definer
set search_path = crm, public
as $$
declare
  v_at timestamptz;
  v_rows integer;
begin
  if not crm.is_admin() then
    raise exception 'Только администратор может отменить возврат графика';
  end if;

  select max(saved_at) into v_at
  from crm.schedule_backup
  where contract_id = p_contract_id and reason = 'restore_schedule';
  if v_at is null then
    raise exception 'Нет сохранённого графика для этого договора';
  end if;

  perform set_config('crm.audit_off', 'on', true);

  delete from crm.contract_payments where contract_id = p_contract_id and not paid;

  insert into crm.contract_payments (contract_id, due_date, amount, paid, paid_date)
  select contract_id, due_date, amount, false, null
  from crm.schedule_backup
  where contract_id = p_contract_id and reason = 'restore_schedule' and saved_at = v_at;
  get diagnostics v_rows = row_count;

  delete from crm.schedule_backup
  where contract_id = p_contract_id and reason = 'restore_schedule' and saved_at = v_at;

  perform set_config('crm.audit_off', 'off', true);

  insert into crm.audit_log (actor_id, action, entity_type, entity_id, details)
  values (
    auth.uid(), 'update', 'contract', p_contract_id,
    jsonb_build_object(
      'schedule_restore_undone', true,
      'schedule_payments', v_rows,
      '_context', crm.audit_context('contract', p_contract_id)
    )
  );
  return v_rows;
end;
$$;

grant execute on function crm.undo_restore_schedule(uuid) to authenticated;

notify pgrst, 'reload schema';


-- ### 084_due_this_month_minus_received.sql

-- ============================================================
-- 084: «К оплате в этом месяце» уменьшается, когда клиент платит В ЭТОМ месяце
--
-- ЧТО БЫЛО НЕ ТАК. Блок 081 считал остаток этого месяца той же раскладкой,
-- что и просрочку: деньги закрывают самые СТАРЫЕ строки графика первыми.
-- Клиент без долгов, заплативший за месяц, исчезал из суммы -- всё верно.
-- Но у клиента с просрочкой платёж этого месяца уходил на старые месяцы, и
-- строка текущего месяца оставалась «не закрытой»: человек заплатил свой
-- ежемесячный взнос, а карточка на дашборде не менялась. Так же при
-- частичной оплате: заплатил 4 000 из 10 000 -- в карточке всё ещё 10 000.
--
-- КАК СЧИТАЕМ ТЕПЕРЬ. По каждому договору, у которого есть платёж в этом
-- месяце:
--   запланировано  -- сумма строк графика на этот месяц (как раньше);
--   поступило      -- сколько денег пришло в ПЛАН за этот месяц: прирост
--                     «пула» раскладки (оплачено минус первоначальный взнос,
--                     см. представление overdue_installments) с начала
--                     месяца. Первоначальный взнос, внесённый в этом месяце,
--                     в «поступило» не входит -- он не часть графика;
--   осталось       -- меньшее из двух:
--                       * остаток строк месяца по старой раскладке (учитывает
--                         предоплату, внесённую раньше), и
--                       * запланировано минус поступило в этом месяце.
-- Долг прошлых месяцев по-прежнему виден в «Должниках» и «Просрочено»; он не
-- «съедается» и не прячется -- просто платёж этого месяца считается платежом
-- этого месяца.
--
-- Меняются два представления данных: новое представление
-- crm.due_this_month_by_contract (одна строка на договор) и обе функции
-- due_this_month_contracts() / due_this_month_totals() -- сигнатуры и состав
-- колонок те же, интерфейс не трогаем. set search_path у функций убран: под
-- RLS он замедляет вызов (см. блок 082); таблицы везде указаны с схемой.
--
-- Идемпотентно, данные не трогает.
-- ============================================================

create or replace view crm.due_this_month_by_contract
with (security_invoker = on)
as
with bounds as (
  select date_trunc('month', current_date)::date                       as m0,
         (date_trunc('month', current_date) + interval '1 month')::date as m1
),
month_rows as (
  select oi.contract_id,
         sum(oi.scheduled_amount) as scheduled,
         sum(oi.unpaid_amount)    as unpaid_fifo
  from crm.overdue_installments oi, bounds b
  where oi.due_date >= b.m0
    and oi.due_date <  b.m1
  group by oi.contract_id
),
plan_total as (
  select p.contract_id, sum(p.amount) as plan_total
  from crm.contract_payments p
  where not p.paid
    and p.contract_id in (select contract_id from month_rows)
  group by p.contract_id
),
received as (
  select p.contract_id, sum(p.amount) as received
  from crm.contract_payments p, bounds b
  where p.paid
    and coalesce(p.paid_date, p.due_date) >= b.m0
    and p.contract_id in (select contract_id from month_rows)
  group by p.contract_id
)
select
  mr.contract_id,
  mr.scheduled as scheduled_amount,
  least(mr.unpaid_fifo, greatest(mr.scheduled - applied.v, 0)) as unpaid_amount
from month_rows mr
join crm.contracts c on c.id = mr.contract_id
left join plan_total pt on pt.contract_id = mr.contract_id
left join received   r  on r.contract_id  = mr.contract_id
cross join lateral (
  -- Сколько денег легло на ПЛАН за этот месяц: пул сейчас минус пул на начало месяца.
  select greatest(c.paid_amount - (c.amount - coalesce(pt.plan_total, 0)), 0)
       - greatest(c.paid_amount - coalesce(r.received, 0) - (c.amount - coalesce(pt.plan_total, 0)), 0) as v
) applied;

grant select on crm.due_this_month_by_contract to authenticated;


create or replace function crm.due_this_month_contracts(p_building_id uuid default null)
returns table (
  contract_id uuid,
  contract_number text,
  client_id uuid,
  client_name text,
  client_phone text,
  object_id uuid,
  object_name text,
  object_block text,
  object_floor integer,
  building_id uuid,
  building_name text,
  currency text,
  scheduled_amount numeric,
  unpaid_amount numeric
)
language sql
stable
security invoker
as $$
  select
    c.id,
    c.number,
    cl.id,
    coalesce(cl.name, '—'),
    cl.phone,
    o.id,
    o.name,
    o.block,
    o.floor,
    o.building_id,
    coalesce(b.name, '—'),
    c.currency::text,
    d.scheduled_amount,
    d.unpaid_amount
  from crm.due_this_month_by_contract d
  join crm.contracts c on c.id = d.contract_id
  left join crm.clients   cl on cl.id = c.client_id
  left join crm.objects   o  on o.id = c.object_id
  left join crm.buildings b  on b.id = o.building_id
  where (p_building_id is null or o.building_id = p_building_id)
  order by d.unpaid_amount desc, c.id;
$$;

grant execute on function crm.due_this_month_contracts(uuid) to authenticated;


create or replace function crm.due_this_month_totals(
  p_building_id uuid default null,
  p_active_only boolean default false
)
returns table (
  currency text,
  contracts int,
  unpaid_contracts int,
  scheduled_total numeric,
  unpaid_total numeric
)
language sql
stable
security invoker
as $$
  select
    c.currency::text,
    (count(*))::int,
    (count(*) filter (where d.unpaid_amount > 0.005))::int,
    sum(d.scheduled_amount),
    sum(d.unpaid_amount)
  from crm.due_this_month_by_contract d
  join crm.contracts c on c.id = d.contract_id
  left join crm.objects   o on o.id = c.object_id
  left join crm.buildings b on b.id = o.building_id
  where (p_building_id is null or o.building_id = p_building_id)
    -- Как на дашборде: в общей сводке достроенный ЖК не участвует,
    -- а если выбран конкретный дом -- показывается как есть.
    and (
      p_building_id is not null
      or not p_active_only
      or coalesce(b.construction_status, 'in_progress') <> 'completed'
    )
  group by c.currency
  order by sum(d.unpaid_amount) desc;
$$;

grant execute on function crm.due_this_month_totals(uuid, boolean) to authenticated;

notify pgrst, 'reload schema';
