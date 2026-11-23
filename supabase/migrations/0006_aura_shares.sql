-- Migration: 0006_aura_shares
-- Ephemeral Lab demo shares: AuraCard PNG + report snapshot, 24h TTL.
-- Public aura-shares bucket; anon may read unexpired, non-revoked rows only.

create table if not exists public.aura_shares (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  report_json jsonb not null,
  image_path text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  revoked_at timestamptz null
);

create index if not exists aura_shares_owner_id_idx
  on public.aura_shares (owner_id);

create index if not exists aura_shares_expires_at_idx
  on public.aura_shares (expires_at);

alter table public.aura_shares enable row level security;

drop policy if exists "users can insert own aura shares" on public.aura_shares;
create policy "users can insert own aura shares"
  on public.aura_shares
  for insert
  to authenticated
  with check (auth.uid() = owner_id);

drop policy if exists "users can read own aura shares" on public.aura_shares;
create policy "users can read own aura shares"
  on public.aura_shares
  for select
  to authenticated
  using (auth.uid() = owner_id);

drop policy if exists "users can delete own aura shares" on public.aura_shares;
create policy "users can delete own aura shares"
  on public.aura_shares
  for delete
  to authenticated
  using (auth.uid() = owner_id);

drop policy if exists "users can update own aura shares" on public.aura_shares;
create policy "users can update own aura shares"
  on public.aura_shares
  for update
  to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- Scanners (anon) only see live shares.
drop policy if exists "anon can read live aura shares" on public.aura_shares;
create policy "anon can read live aura shares"
  on public.aura_shares
  for select
  to anon
  using (revoked_at is null and expires_at > now());

grant select, insert, update, delete on public.aura_shares to authenticated;
grant select on public.aura_shares to anon;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'aura-shares',
  'aura-shares',
  true,
  2097152, -- 2 MB (card PNG)
  array['image/png']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Public bucket: anyone can read objects (path is unguessable).
drop policy if exists "public can read aura share images" on storage.objects;
create policy "public can read aura share images"
  on storage.objects
  for select
  to public
  using (bucket_id = 'aura-shares');

drop policy if exists "users can upload own aura share images" on storage.objects;
create policy "users can upload own aura share images"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'aura-shares'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "users can delete own aura share images" on storage.objects;
create policy "users can delete own aura share images"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'aura-shares'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

notify pgrst, 'reload schema';
