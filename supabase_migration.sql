create extension if not exists pgcrypto;

create table if not exists public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  category text,
  keywords text[] default '{}',
  diagnosis_tags text[] default '{}',
  source_name text,
  source_page integer,
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.admin_ai_config (
  id text primary key default 'default',
  app_id text,
  provider text not null default 'gemini',
  provider_label text,
  base_url text,
  api_key text not null default '',
  model text not null default 'gemini-2.0-flash',
  gemini_fallback_api_key text,
  gemini_fallback_model text default 'gemini-2.0-flash',
  updated_at timestamptz default now()
);

create table if not exists public.admin_ai_providers (
  id uuid primary key default gen_random_uuid(),
  app_id text not null,
  provider text not null,
  provider_label text,
  base_url text,
  api_key text not null default '',
  model text not null,
  active boolean default false,
  gemini_fallback_api_key text,
  gemini_fallback_model text default 'gemini-2.0-flash',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (app_id, provider)
);

create table if not exists public.admin_ai_users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  password_hash text not null,
  active boolean default true,
  active_device_id text,
  session_token text,
  session_expires_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.admin_ai_config
add column if not exists app_id text;

alter table public.admin_ai_config
add column if not exists provider_label text;

alter table public.admin_ai_config
add column if not exists base_url text;

alter table public.admin_ai_config
alter column api_key set default '';

alter table public.admin_ai_config
alter column app_id set default 'resume-medis-reviewer';

update public.admin_ai_config
set app_id = case
  when id = 'default' then 'resume-medis-reviewer'
  else id
end
where app_id is null;

update public.admin_ai_config
set id = 'resume-medis-reviewer'
where id = 'default'
  and not exists (
    select 1 from public.admin_ai_config existing
    where existing.id = 'resume-medis-reviewer'
  );

insert into public.admin_ai_config (id, app_id, provider, api_key, model)
select 'resume-medis-reviewer', 'resume-medis-reviewer', 'gemini', '', 'gemini-2.0-flash'
where not exists (
  select 1 from public.admin_ai_config where app_id = 'resume-medis-reviewer'
);

insert into public.admin_ai_config (id, app_id, provider, api_key, model)
values
  ('eklaim-koding-assistant', 'eklaim-koding-assistant', 'gemini', '', 'gemini-2.0-flash'),
  ('soap-gen', 'soap-gen', 'gemini', '', 'gemini-2.0-flash'),
  ('icd-search-helper', 'icd-search-helper', 'gemini', '', 'gemini-2.0-flash')
on conflict (id) do nothing;

insert into public.admin_ai_providers (
  app_id,
  provider,
  provider_label,
  base_url,
  api_key,
  model,
  active,
  gemini_fallback_api_key,
  gemini_fallback_model
)
select
  app_id,
  provider,
  provider_label,
  base_url,
  api_key,
  model,
  true,
  gemini_fallback_api_key,
  gemini_fallback_model
from public.admin_ai_config
where app_id is not null
  and not exists (
    select 1
    from public.admin_ai_providers existing_active
    where existing_active.app_id = public.admin_ai_config.app_id
      and existing_active.active = true
  )
  and not exists (
    select 1
    from public.admin_ai_providers existing_provider
    where existing_provider.app_id = public.admin_ai_config.app_id
      and existing_provider.provider = public.admin_ai_config.provider
  );

create unique index if not exists admin_ai_config_app_id_idx
  on public.admin_ai_config (app_id);

create index if not exists admin_ai_providers_app_id_idx
  on public.admin_ai_providers (app_id);

create unique index if not exists admin_ai_providers_active_app_idx
  on public.admin_ai_providers (app_id)
  where active = true;

create unique index if not exists admin_ai_users_username_idx
  on public.admin_ai_users (username);

create index if not exists knowledge_chunks_active_idx
  on public.knowledge_chunks (active);

create index if not exists knowledge_chunks_keywords_idx
  on public.knowledge_chunks using gin (keywords);

create index if not exists knowledge_chunks_diagnosis_tags_idx
  on public.knowledge_chunks using gin (diagnosis_tags);

alter table public.knowledge_chunks enable row level security;
alter table public.admin_ai_config enable row level security;
alter table public.admin_ai_providers enable row level security;
alter table public.admin_ai_users enable row level security;

drop policy if exists "Read active knowledge chunks" on public.knowledge_chunks;
create policy "Read active knowledge chunks"
on public.knowledge_chunks
for select
to anon
using (active = true);
