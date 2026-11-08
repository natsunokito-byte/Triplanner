-- Trip Planner schema (Supabase / Postgres)
-- Editor = authenticated owner. Viewers go through server routes (service role) using share_token + signed cookie.

create extension if not exists "pgcrypto";

create type plan_type as enum
  ('breakfast','lunch','dinner','tea','workshop','cosplay_photoshoot','date','hangout','event','task','wake_up','meal','work','crunch');  -- breakfast/lunch/dinner/workshop are legacy (merged into meal / crunch)
create type booking_status as enum ('confirmed','not_booked');
create type commute_method as enum ('walk','train','subway','bus','taxi','flight','car','bike','other');
create type payment_method as enum ('ticket','ic_card','cash');
create type todo_category as enum ('hotel','ticket','cosplay','plan','general');
create type view_mode as enum ('mine','all');
create type plan_visibility as enum ('normal','participants_only','owner_only');
create type request_status as enum ('pending','accepted','declined','cancelled','expired');

create table trips (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  start_date date not null,
  end_date date not null,
  timezone text not null default 'Asia/Tokyo',       -- IANA tz; all plan times are local to this
  currency text not null default 'JPY',               -- trip base currency (ISO 4217)
  destinations text[] not null default '{}',
  share_token text not null unique default encode(gen_random_bytes(16),'hex'),
  share_enabled boolean not null default true,
  viewers_see_costs boolean not null default false,   -- only affects can_view_all viewers; restricted viewers never see costs
  invite_locale text not null default 'zh-TW',        -- 'zh-TW' | 'en' for invite text / exports
  -- 'Make a plan' mode (availability sharing)
  availability_enabled boolean not null default true,
  availability_public boolean not null default false,  -- true: free/busy tab viewable WITHOUT email verification (verify only when requesting)
  availability_token text not null unique default encode(gen_random_bytes(16),'hex'),  -- separate link: grants free/busy only, never plan details
  avail_day_start time not null default '09:00',       -- trip-local window in which requests are allowed
  avail_day_end time not null default '22:00',
  avail_buffer_min int not null default 30,            -- padding around busy blocks (travel/rest)
  avail_min_notice_hours int not null default 12,
  availability_blocked_emails text[] not null default '{}',  -- requesters the owner has blocked (lowercase)
  usd_rate_override numeric(24,12),                    -- 1 trip-currency = x USD; null = use fx_rates
  last_opened_at timestamptz default now(),
  created_at timestamptz default now(),
  check (end_date >= start_date)
);

create table people (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  name text not null,
  email text,                                          -- used for invite + viewer verification
  is_me boolean not null default false,
  can_view_all boolean not null default false,        -- allow-listed viewers who may see everything
  locale text not null default 'zh-TW',
  color text,                                          -- for avatar/scoreboard
  unique (trip_id, email)
);

create table hotels (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  name text not null,
  address text,
  booking_status booking_status not null default 'not_booked',
  check_in timestamptz not null,
  check_out timestamptz not null,
  cost numeric(12,2),
  cost_currency text,                                  -- null = trip currency
  link text,
  note text,
  check (check_out > check_in)
  -- nights = (check_out::date - check_in::date), computed in app/view
);

create table plans (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  type plan_type not null,
  title text not null,
  location_name text,
  location_address text,
  start_at timestamptz,                                -- null = not scheduled yet (shown under "Unscheduled"; never counts as busy time)
  duration_min int not null default 60 check (duration_min >= 30),  -- plans: 30 min minimum
  cost numeric(12,2),
  cost_currency text,                                  -- null = trip currency
  fx_rate_to_trip numeric(14,6),                       -- manual rate when cost_currency differs
  usd_per_unit_at_completion numeric(24,12),            -- FX frozen on the day the plan is marked complete (USD per 1 unit of its currency)
  link text,
  note text,
  -- cosplay_photoshoot only
  character_name text,
  photographer_name text,                              -- cosplay_photoshoot only
  photographer_fee numeric(12,2),                      -- cosplay_photoshoot only (plan currency)
  open_claim boolean not null default false,           -- open for anyone with the claim-page link to ask to join
  claim_proposal text,                                  -- optional idea shown on the claim page
  has_meeting boolean not null default false,          -- work plans: meetings during this block (highlighted pill)
  plan_date date,                                      -- date known, time not decided (start_at null)
  plan_time time,                                      -- time known, date not decided (start_at null)
  studio_name text,                                    -- cosplay_photoshoot only
  studio_fee numeric(12,2),                            -- cosplay_photoshoot only (plan currency)
  ics_token text not null unique default encode(gen_random_bytes(12),'hex'),  -- unguessable per-plan .ics link
  -- normal: per viewer rules | participants_only: only owner + listed participants (hidden from can_view_all viewers not on the plan)
  -- owner_only: only the owner. Both non-normal levels still count as 'busy' in availability, with no details.
  visibility plan_visibility not null default 'normal',
  completed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz default now()
);
create index on plans (trip_id, start_at);

-- Itemised costs. plans.cost always holds the computed TOTAL
-- (photographer_fee + studio_fee + sum(items; per_hour items are amount x duration hours)),
-- so dashboards / exports / viewer shaping keep reading one number.
create table plan_cost_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references plans(id) on delete cascade,
  label text not null,
  amount numeric(12,2) not null check (amount >= 0),
  per_hour boolean not null default false,
  position int not null default 0
);
create index on plan_cost_items (plan_id, position);

create table plan_people (
  plan_id uuid references plans(id) on delete cascade,
  person_id uuid references people(id) on delete cascade,
  primary key (plan_id, person_id)
);

create table plan_photos (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references plans(id) on delete cascade,
  storage_path text not null,                          -- bucket: trip-photos/{trip_id}/{plan_id}/{uuid}.jpg
  caption text,
  created_at timestamptz default now()
);

create table commutes (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  from_plan_id uuid references plans(id) on delete cascade,   -- null = from hotel
  to_plan_id uuid references plans(id) on delete cascade,     -- null = back to hotel
  -- explicit origin / destination (defaults copied from the plans' / hotel's location, editable)
  origin_label text,
  origin_place_id text,                                       -- Google place_id: may be stored indefinitely
  origin_lat double precision,                                -- Google lat/lng: cache max 30 days (refresh via place_id)
  origin_lng double precision,
  origin_cached_at timestamptz,
  dest_label text,
  dest_place_id text,
  dest_lat double precision,
  dest_lng double precision,
  dest_cached_at timestamptz,
  distance_m int,
  duration_source text not null default 'manual' check (duration_source in ('manual','google')),
  estimated_at timestamptz,
  method commute_method not null,
  start_at timestamptz not null,
  duration_min int not null check (duration_min >= 0),         -- commute: no minimum
  cost numeric(12,2),
  cost_currency text,                                  -- null = trip currency
  payment payment_method,
  note text
);

-- Intermediate stops on a commute, each with a stay time. Busy time = travel + sum(stay).
create table commute_stops (
  id uuid primary key default gen_random_uuid(),
  commute_id uuid not null references commutes(id) on delete cascade,
  label text not null,
  stay_min int not null default 0 check (stay_min >= 0),
  position int not null default 0
);
create index on commute_stops (commute_id, position);

-- Owner-defined to-do categories (the built-in enum categories stay as-is)
create table todo_categories (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  name text not null,
  position int not null default 0
);

create table todos (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  category todo_category not null default 'general',
  category_id uuid references todo_categories(id) on delete set null,  -- custom category; null = use built-in `category`
  title text not null,
  done boolean not null default false,
  due_date date,
  -- exactly one owner (or none for general)
  hotel_id uuid references hotels(id) on delete cascade,
  commute_id uuid references commutes(id) on delete cascade,
  plan_id uuid references plans(id) on delete cascade,
  is_task boolean not null default false,              -- to-do from a task/crunch plan (own tab on the to-do page)
  auto_generated boolean not null default false,       -- created by "not booked" / "ticket" rules
  sort int default 0
);

-- Verified viewers (email OTP). One row per trip+email once verified.
create table viewer_sessions (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  person_id uuid references people(id) on delete set null,
  email text not null,
  created_at timestamptz default now()
);

-- Owner-defined 'not available' windows (in addition to plans/hotel/commute busy time)
create table availability_blocks (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  note text,                                            -- owner's eyes only
  check (end_at > start_at)
);

-- Public claims on open plans (M18). Written only by server code (service role); owner reads/decides under RLS.
create table plan_claims (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  plan_id uuid not null references plans(id) on delete cascade,
  claimer_name text not null,
  claimer_email text not null,
  message text,
  status text not null default 'pending' check (status in ('pending','accepted','declined','expired')),
  owner_reply text,
  created_at timestamptz default now(),
  decided_at timestamptz
);
create index on plan_claims (trip_id, status, created_at);
create index on plan_claims (plan_id, status);

-- Public proposals: a visitor suggests a plan; the owner can turn it into a real plan (M19). Written by server code only.
create table plan_proposals (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  proposer_name text not null,
  type text not null,
  title text not null,
  note text,
  rough_date date,
  rough_time text,
  rough_location text,
  status text not null default 'pending' check (status in ('pending','accepted','declined','expired')),
  plan_id uuid references plans(id) on delete set null,
  created_at timestamptz default now(),
  decided_at timestamptz
);
create index on plan_proposals (trip_id, status, created_at);

-- (legacy, unused since M18) Requests from verified viewers to hang out. Accepting creates a plan (plans.id stored in plan_id).
create table plan_requests (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  requester_email text not null,
  requester_person_id uuid references people(id) on delete set null,
  email_verified_at timestamptz not null,               -- requester must verify email before submitting
  requester_name text not null,
  type plan_type not null default 'hangout',
  start_at timestamptz not null,
  duration_min int not null check (duration_min >= 30),
  location_text text,
  message text,
  status request_status not null default 'pending',
  plan_id uuid references plans(id) on delete set null,
  owner_reply text,
  created_at timestamptz default now(),
  decided_at timestamptz
);
create index on plan_requests (trip_id, status, start_at);

-- Viewer email OTP (self-built; viewers are NOT auth users)
create table viewer_otps (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  email text not null,
  purpose text not null default 'view',                -- 'view' (listed viewers) | 'request' (any email, make-a-plan)
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  created_at timestamptz default now()
);

-- Daily FX cache, USD pivot: rate = how many USD per 1 unit of `currency`
create table fx_rates (
  day date not null,
  currency text not null,
  usd_per_unit numeric(24,12) not null,
  primary key (day, currency)
);

-- RLS: editor-only tables. Viewer access never hits these directly.
do $$
declare t text;
begin
  foreach t in array array['trips','people','hotels','plans','plan_people','plan_photos','commutes','todos','todo_categories','plan_cost_items','commute_stops','viewer_sessions','viewer_otps','fx_rates','availability_blocks','plan_requests','plan_claims','plan_proposals']
  loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

create policy trips_owner on trips for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
-- child tables: owner of parent trip
create policy people_owner   on people   for all using (exists (select 1 from trips x where x.id = trip_id and x.owner_id = auth.uid()));
create policy hotels_owner   on hotels   for all using (exists (select 1 from trips x where x.id = trip_id and x.owner_id = auth.uid()));
create policy plans_owner    on plans    for all using (exists (select 1 from trips x where x.id = trip_id and x.owner_id = auth.uid()));
create policy commutes_owner on commutes for all using (exists (select 1 from trips x where x.id = trip_id and x.owner_id = auth.uid()));
create policy todos_owner    on todos    for all using (exists (select 1 from trips x where x.id = trip_id and x.owner_id = auth.uid()));
create policy todo_categories_owner on todo_categories for all using (exists (select 1 from trips x where x.id = trip_id and x.owner_id = auth.uid()));
create policy plan_cost_items_owner on plan_cost_items for all using (exists (select 1 from plans p join trips x on x.id = p.trip_id where p.id = plan_id and x.owner_id = auth.uid()));
create policy commute_stops_owner on commute_stops for all using (exists (select 1 from commutes c join trips x on x.id = c.trip_id where c.id = commute_id and x.owner_id = auth.uid()));
create policy plan_people_owner on plan_people for all using (exists (select 1 from plans p join trips x on x.id = p.trip_id where p.id = plan_id and x.owner_id = auth.uid()));
create policy plan_photos_owner on plan_photos for all using (exists (select 1 from plans p join trips x on x.id = p.trip_id where p.id = plan_id and x.owner_id = auth.uid()));
create policy viewer_sessions_owner on viewer_sessions for select using (exists (select 1 from trips x where x.id = trip_id and x.owner_id = auth.uid()));

create policy fx_rates_read on fx_rates for select using (auth.role() = 'authenticated');
-- viewer_otps: no policies => only service role can touch it.
create policy availability_blocks_owner on availability_blocks for all using (exists (select 1 from trips x where x.id = trip_id and x.owner_id = auth.uid()));
create policy plan_claims_owner on plan_claims for all using (exists (select 1 from trips x where x.id = trip_id and x.owner_id = auth.uid()));
create policy plan_proposals_owner on plan_proposals for all using (exists (select 1 from trips x where x.id = trip_id and x.owner_id = auth.uid()));
create policy plan_requests_owner on plan_requests for all using (exists (select 1 from trips x where x.id = trip_id and x.owner_id = auth.uid()));
-- Viewers create/read their own requests only through server routes (service role).

-- ───────────── Storage: private bucket for plan photos (M5) ─────────────
-- Object path: {trip_id}/{plan_id}/{uuid}.jpg  (first folder = trip id => owner check)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('trip-photos', 'trip-photos', false, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy trip_photos_select on storage.objects for select to authenticated
  using (bucket_id = 'trip-photos' and exists (select 1 from public.trips t where t.id::text = (storage.foldername(name))[1] and t.owner_id = auth.uid()));
create policy trip_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'trip-photos' and exists (select 1 from public.trips t where t.id::text = (storage.foldername(name))[1] and t.owner_id = auth.uid()));
create policy trip_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'trip-photos' and exists (select 1 from public.trips t where t.id::text = (storage.foldername(name))[1] and t.owner_id = auth.uid()));
