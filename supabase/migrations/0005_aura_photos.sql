-- Migration: 0005_aura_photos
-- Stores the Storage path for each report's 640px JPEG, and creates a private
-- aura-photos bucket with per-user folder RLS (<user_id>/...).

alter table public.aura_reports
  add column if not exists photo_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'aura-photos',
  'aura-photos',
  false,
  524288, -- 512 KB (photos are ~50–100 KB)
  array['image/jpeg']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "users can read own aura photos" on storage.objects;
create policy "users can read own aura photos"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'aura-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "users can upload own aura photos" on storage.objects;
create policy "users can upload own aura photos"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'aura-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "users can delete own aura photos" on storage.objects;
create policy "users can delete own aura photos"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'aura-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

notify pgrst, 'reload schema';
