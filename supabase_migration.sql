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
  provider text not null default 'gemini',
  api_key text not null,
  model text not null default 'gemini-2.0-flash',
  gemini_fallback_api_key text,
  gemini_fallback_model text default 'gemini-2.0-flash',
  updated_at timestamptz default now()
);

create index if not exists knowledge_chunks_active_idx
  on public.knowledge_chunks (active);

create index if not exists knowledge_chunks_keywords_idx
  on public.knowledge_chunks using gin (keywords);

create index if not exists knowledge_chunks_diagnosis_tags_idx
  on public.knowledge_chunks using gin (diagnosis_tags);

alter table public.knowledge_chunks enable row level security;
alter table public.admin_ai_config enable row level security;

drop policy if exists "Read active knowledge chunks" on public.knowledge_chunks;
create policy "Read active knowledge chunks"
on public.knowledge_chunks
for select
to anon
using (active = true);
