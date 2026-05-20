-- Adds stable client ids for syncing existing WeatherHop localStorage records.
-- Run after schema.sql if the base schema has already been applied.

alter table public.trips
add column if not exists client_id text;

alter table public.trip_stops
add column if not exists client_id text;

alter table public.favorites
add column if not exists client_id text;

update public.trips
set client_id = id::text
where client_id is null;

update public.trip_stops
set client_id = id::text
where client_id is null;

update public.favorites
set client_id = id::text
where client_id is null;

alter table public.trips
alter column client_id set not null;

alter table public.trip_stops
alter column client_id set not null;

alter table public.favorites
alter column client_id set not null;

create unique index if not exists trips_user_client_id_unique
  on public.trips(user_id, client_id);

create unique index if not exists trip_stops_user_client_id_unique
  on public.trip_stops(user_id, client_id);

create unique index if not exists favorites_user_client_id_unique
  on public.favorites(user_id, client_id);
