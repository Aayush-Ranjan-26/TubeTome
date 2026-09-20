-- Mirrors the live TubeTome project (profiles + import_history + sign-up trigger). Run once on a fresh project.

create table if not exists public.profiles (
  id uuid primary key,
  auth_user_id uuid unique references auth.users(id) on delete cascade,
  email text not null,
  name text,
  avatar_url text,
  automation_configured boolean default false,
  automation_last_verified timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.import_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  auth_user_id uuid references auth.users(id) on delete cascade,
  playlist_url text not null,
  playlist_title text not null,
  playlist_channel text,
  video_count int not null default 0,
  status text not null default 'waiting'
    check (status in ('waiting', 'processing', 'completed', 'failed', 'cancelled')),
  notebook_url text,
  error_message text,
  job_id text,
  videos_data jsonb,
  created_at timestamptz default now(),
  completed_at timestamptz
);

alter table public.profiles enable row level security;
alter table public.import_history enable row level security;

create policy profiles_select on public.profiles for select using (auth.uid() = auth_user_id);
create policy profiles_update on public.profiles for update using (auth.uid() = auth_user_id);
create policy profiles_insert on public.profiles for insert with check (auth.uid() = id);
create policy history_select on public.import_history for select using (auth.uid() = auth_user_id);
create policy history_insert on public.import_history for insert with check (auth.uid() = auth_user_id);
create policy history_delete on public.import_history for delete using (auth.uid() = auth_user_id);

-- Auto-create a profile row from the Google identity on sign-in.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, auth_user_id, email, name, avatar_url)
  values (new.id, new.id, new.email,
          coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
          coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture'))
  on conflict (id) do update set
    email = excluded.email,
    name = coalesce(excluded.name, public.profiles.name),
    avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url),
    auth_user_id = excluded.auth_user_id,
    updated_at = now();
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
