-- Add admin API key slot for app_id: claim-clarify
-- Safe to run more than once. Existing API keys/config are not overwritten.

insert into public.admin_ai_config (app_id, provider, api_key, model)
select 'claim-clarify', 'gemini', '', 'gemini-2.0-flash'
where not exists (
  select 1
  from public.admin_ai_config
  where app_id = 'claim-clarify'
);

insert into public.admin_ai_providers (
  app_id,
  provider,
  provider_label,
  base_url,
  api_key,
  model,
  active,
  gemini_fallback_model
)
select
  'claim-clarify',
  'gemini',
  'Gemini',
  null,
  '',
  'gemini-2.0-flash',
  true,
  'gemini-2.0-flash'
where not exists (
  select 1
  from public.admin_ai_providers
  where app_id = 'claim-clarify'
    and active = true
)
and not exists (
  select 1
  from public.admin_ai_providers
  where app_id = 'claim-clarify'
    and provider = 'gemini'
);
