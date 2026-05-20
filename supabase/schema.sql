-- WeatherHop Supabase schema
-- Run this in Supabase SQL Editor after creating the project.
-- It creates user-owned tables for synced trips, stops, favorites, and settings.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do update set email = excluded.email;

  insert into public.user_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  default_zip text,
  use_current_location_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null,
  label text,
  mode text not null check (mode in ('zip', 'geo')),
  zip text,
  lat double precision,
  lon double precision,
  city text,
  state text,
  country text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (mode = 'zip' and zip is not null and lat is null and lon is null)
    or
    (mode = 'geo' and lat is not null and lon is not null)
  ),
  check (lat is null or (lat >= -90 and lat <= 90)),
  check (lon is null or (lon >= -180 and lon <= 180))
);

create unique index if not exists favorites_user_zip_unique
  on public.favorites(user_id, zip)
  where mode = 'zip';

create unique index if not exists favorites_user_geo_unique
  on public.favorites(user_id, lat, lon)
  where mode = 'geo';

create unique index if not exists favorites_user_client_id_unique
  on public.favorites(user_id, client_id);

create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null,
  name text not null default 'New Trip',
  start_date date not null,
  end_date date not null,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create table if not exists public.trip_stops (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null,
  stop_order integer not null default 0,
  name text,
  display_name text not null,
  latitude double precision not null,
  longitude double precision not null,
  arrival_date date not null,
  departure_date date not null,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (latitude >= -90 and latitude <= 90),
  check (longitude >= -180 and longitude <= 180),
  check (departure_date >= arrival_date)
);

create index if not exists trips_user_updated_idx
  on public.trips(user_id, updated_at desc);

create unique index if not exists trips_user_client_id_unique
  on public.trips(user_id, client_id);

create index if not exists trip_stops_trip_order_idx
  on public.trip_stops(trip_id, stop_order, arrival_date);

create index if not exists trip_stops_user_idx
  on public.trip_stops(user_id);

create unique index if not exists trip_stops_user_client_id_unique
  on public.trip_stops(user_id, client_id);

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists user_settings_set_updated_at on public.user_settings;
create trigger user_settings_set_updated_at
before update on public.user_settings
for each row execute function public.set_updated_at();

drop trigger if exists favorites_set_updated_at on public.favorites;
create trigger favorites_set_updated_at
before update on public.favorites
for each row execute function public.set_updated_at();

drop trigger if exists trips_set_updated_at on public.trips;
create trigger trips_set_updated_at
before update on public.trips
for each row execute function public.set_updated_at();

drop trigger if exists trip_stops_set_updated_at on public.trip_stops;
create trigger trip_stops_set_updated_at
before update on public.trip_stops
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.favorites enable row level security;
alter table public.trips enable row level security;
alter table public.trip_stops enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.user_settings to authenticated;
grant select, insert, update, delete on public.favorites to authenticated;
grant select, insert, update, delete on public.trips to authenticated;
grant select, insert, update, delete on public.trip_stops to authenticated;

drop policy if exists "Users can read their own profile" on public.profiles;
create policy "Users can read their own profile"
on public.profiles for select
to authenticated
using (auth.uid() = id);

drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile"
on public.profiles for insert
to authenticated
with check (auth.uid() = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
on public.profiles for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "Users can read their own settings" on public.user_settings;
create policy "Users can read their own settings"
on public.user_settings for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own settings" on public.user_settings;
create policy "Users can insert their own settings"
on public.user_settings for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own settings" on public.user_settings;
create policy "Users can update their own settings"
on public.user_settings for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own settings" on public.user_settings;
create policy "Users can delete their own settings"
on public.user_settings for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can read their own favorites" on public.favorites;
create policy "Users can read their own favorites"
on public.favorites for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own favorites" on public.favorites;
create policy "Users can insert their own favorites"
on public.favorites for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own favorites" on public.favorites;
create policy "Users can update their own favorites"
on public.favorites for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own favorites" on public.favorites;
create policy "Users can delete their own favorites"
on public.favorites for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can read their own trips" on public.trips;
create policy "Users can read their own trips"
on public.trips for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own trips" on public.trips;
create policy "Users can insert their own trips"
on public.trips for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own trips" on public.trips;
create policy "Users can update their own trips"
on public.trips for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own trips" on public.trips;
create policy "Users can delete their own trips"
on public.trips for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can read their own trip stops" on public.trip_stops;
create policy "Users can read their own trip stops"
on public.trip_stops for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own trip stops" on public.trip_stops;
create policy "Users can insert their own trip stops"
on public.trip_stops for insert
to authenticated
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.trips t
    where t.id = trip_id
      and t.user_id = auth.uid()
  )
);

drop policy if exists "Users can update their own trip stops" on public.trip_stops;
create policy "Users can update their own trip stops"
on public.trip_stops for update
to authenticated
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.trips t
    where t.id = trip_id
      and t.user_id = auth.uid()
  )
);

drop policy if exists "Users can delete their own trip stops" on public.trip_stops;
create policy "Users can delete their own trip stops"
on public.trip_stops for delete
to authenticated
using (auth.uid() = user_id);
