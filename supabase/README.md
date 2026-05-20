# WeatherHop Supabase Setup

This folder contains the database setup for optional WeatherHop account sync.

## Project

- Supabase URL: `https://ljzizslxqfhgnnfytbnh.supabase.co`
- Frontend-safe key type: publishable key / anon public key

Do not put the secret key or service role key in `index.html`.

## Apply Schema

1. Open the Supabase project dashboard.
2. Go to **SQL Editor**.
3. Create a new query.
4. Paste the contents of `schema.sql`.
5. Run the query.
6. Paste the contents of `002_client_ids.sql`.
7. Run that query too.

The schema creates:

- `profiles`
- `user_settings`
- `favorites`
- `trips`
- `trip_stops`

It also enables Row Level Security and adds policies so authenticated users can only access rows where their user id matches the row owner.

`002_client_ids.sql` adds stable sync ids that let WeatherHop preserve existing local trips and favorites while Supabase keeps UUID primary keys internally.

## After Schema

The next app work is:

1. Add Supabase auth client to WeatherHop.
2. Add sign in / sign out UI.
3. Keep local storage for anonymous users.
4. Sync local trips and favorites into Supabase after login.
5. Load cloud trips and favorites on signed-in devices.
