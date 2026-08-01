create table if not exists public.app_usage_logs (
  id uuid primary key default gen_random_uuid(),
  app_id text not null,
  username text not null,
  event_type text not null,
  feature text,
  provider text,
  model text,
  success boolean not null default true,
  error_message text,
  duration_ms integer,
  input_chars integer,
  output_chars integer,
  created_at timestamptz default now()
);

create index if not exists app_usage_logs_app_created_idx
  on public.app_usage_logs (app_id, created_at desc);

create index if not exists app_usage_logs_user_created_idx
  on public.app_usage_logs (username, created_at desc);

alter table public.app_usage_logs enable row level security;