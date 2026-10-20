-- Sahi Daam MVP backend (spec v2, section 10). Run once in the Supabase SQL editor.
--
-- What the app's public (anon) key can do:   INSERT into the four tables below. Nothing else.
-- What it cannot do:                         read, change or delete any row.
-- Totals for /stats come only from public.sahi_daam_stats(key), which checks
-- the key against a secret kept in the private schema (not exposed by the API).
--
-- After running, set the stats secret (use a long random string, 32+ characters):
--   insert into private.settings (name, value) values ('stats_key', '<your-secret>')
--   on conflict (name) do update set value = excluded.value;
-- and open  https://<app>/stats?key=<your-secret>

create schema if not exists private;
revoke all on schema private from public;

create table if not exists private.settings (
  name  text primary key,
  value text not null
);
revoke all on private.settings from public;

-- ------------------------------------------------------------------ events

create table if not exists public.events (
  id         bigint generated always as identity primary key,
  anon_id    text        not null check (char_length(anon_id) between 8 and 64),
  name       text        not null check (name in (
               'onboarding_done', 'activated', 'report_uploaded', 'product_added', 'leak_found',
               'price_applied', 'sale_check_used', 'share_clicked', 'referral_signup', 'pro_waitlist_joined')),
  props      jsonb       not null default '{}'::jsonb
               check (jsonb_typeof(props) = 'object' and pg_column_size(props) < 512),
  team       boolean     not null default false,
  created_at timestamptz not null default now()
);
create index if not exists events_anon_day on public.events (anon_id, created_at);
create index if not exists events_name_day on public.events (name, created_at);

-- Waitlist rows are never linked to a device or to product data.
create table if not exists public.waitlist (
  id         bigint generated always as identity primary key,
  contact    text        not null check (char_length(contact) between 5 and 120),
  consent    boolean     not null check (consent),
  lang       text        not null default 'en' check (lang in ('en', 'hi')),
  created_at timestamptz not null default now()
);

create table if not exists public.feedback (
  id         bigint generated always as identity primary key,
  stars      smallint    not null check (stars between 1 and 5),
  text       text        not null default '' check (char_length(text) <= 500),
  lang       text        not null default 'en' check (lang in ('en', 'hi')),
  created_at timestamptz not null default now()
);

-- Opt-in benchmark rows: category, region bucket and rates only.
create table if not exists public.benchmarks (
  id         bigint generated always as identity primary key,
  category   text        not null check (char_length(category) <= 32),
  region     text        not null check (region in ('big_cities', 'mixed', 'small_towns')),
  rto_pct    numeric(5,1) not null check (rto_pct between 0 and 100),
  return_pct numeric(5,1) not null check (return_pct between 0 and 100),
  avg_ship   numeric(7,2) check (avg_ship is null or avg_ship between 0 and 2000),
  created_at timestamptz not null default now()
);

-- Insert-only for the public key: row-level security on, one INSERT policy, no SELECT policy.
alter table public.events     enable row level security;
alter table public.waitlist   enable row level security;
alter table public.feedback   enable row level security;
alter table public.benchmarks enable row level security;

drop policy if exists events_insert on public.events;
create policy events_insert on public.events for insert to anon with check (true);
drop policy if exists waitlist_insert on public.waitlist;
create policy waitlist_insert on public.waitlist for insert to anon with check (true);
drop policy if exists feedback_insert on public.feedback;
create policy feedback_insert on public.feedback for insert to anon with check (true);
drop policy if exists benchmarks_insert on public.benchmarks;
create policy benchmarks_insert on public.benchmarks for insert to anon with check (true);

revoke all on public.events, public.waitlist, public.feedback, public.benchmarks from anon, authenticated;
grant insert (anon_id, name, props, team) on public.events to anon;
grant insert (contact, consent, lang) on public.waitlist to anon;
grant insert (stars, text, lang) on public.feedback to anon;
grant insert (category, region, rto_pct, return_pct, avg_ship) on public.benchmarks to anon;

-- ------------------------------------------------------------ rate limits

-- At most 200 events per device per day. Extra rows are dropped silently
-- (the insert succeeds with nothing written), so a flood can't be used to
-- probe the limit. created_at is always the server's clock.
create or replace function private.events_rate_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.created_at := now();
  if (select count(*) from public.events
        where anon_id = new.anon_id and created_at > now() - interval '1 day') >= 200 then
    return null;
  end if;
  return new;
end $$;

drop trigger if exists events_rate_limit on public.events;
create trigger events_rate_limit before insert on public.events
  for each row execute function private.events_rate_limit();

-- The other tables have no device id; cap them globally per day.
create or replace function private.daily_cap() returns trigger
language plpgsql security definer set search_path = public as $$
declare n bigint;
begin
  new.created_at := now();
  execute format('select count(*) from %I.%I where created_at > now() - interval ''1 day''',
                 tg_table_schema, tg_table_name) into n;
  if n >= tg_argv[0]::bigint then
    return null;
  end if;
  return new;
end $$;

drop trigger if exists waitlist_cap on public.waitlist;
create trigger waitlist_cap before insert on public.waitlist for each row execute function private.daily_cap('2000');
drop trigger if exists feedback_cap on public.feedback;
create trigger feedback_cap before insert on public.feedback for each row execute function private.daily_cap('2000');
drop trigger if exists benchmarks_cap on public.benchmarks;
create trigger benchmarks_cap before insert on public.benchmarks for each row execute function private.daily_cap('20000');

-- ------------------------------------------------------------------ stats

-- Activated seller = finished onboarding AND has at least one product with a
-- report or an order count; the app sends 'activated' once when that first
-- becomes true. Team devices (?team=1) are excluded everywhere.
create or replace function public.sahi_daam_stats(key text) returns jsonb
language plpgsql security definer set search_path = public, private as $$
declare
  secret text;
  result jsonb;
begin
  select value into secret from private.settings where name = 'stats_key';
  if secret is null or key is null or char_length(secret) < 16 or key <> secret then
    perform pg_sleep(0.5);  -- slows guessing
    raise exception 'forbidden' using errcode = '42501';
  end if;

  with e as (
    select anon_id, name, props, created_at::date as day
    from public.events
    where not team
  ),
  daily as (
    select day,
      count(distinct anon_id) filter (where name = 'activated')                                 as activated,
      count(*) filter (where name = 'report_uploaded')                                          as reports,
      coalesce(sum((props->>'products')::numeric) filter (where name in ('product_added', 'report_uploaded')), 0)
        + count(*) filter (where name = 'product_added' and props->>'products' is null)         as products_checked,
      count(*) filter (where name = 'referral_signup')                                          as referrals
    from e group by day
  ),
  losing as (
    -- Products found losing: each device's latest count, so a daily repeat isn't double-counted.
    select distinct on (anon_id) anon_id, day, coalesce((props->>'losing')::numeric, 0) as n
    from e where name = 'leak_found' order by anon_id, day desc
  ),
  losing_day as (select day, sum(n) as products_losing from losing group by day),
  wl as (select created_at::date as day, count(*) as waitlist from public.waitlist group by 1),
  days as (select day from daily union select day from wl union select day from losing_day),
  by_day as (
    select d.day,
      coalesce(daily.activated, 0) as activated,
      coalesce(daily.reports, 0) as reports,
      coalesce(daily.products_checked, 0) as products_checked,
      coalesce(losing_day.products_losing, 0) as products_losing,
      coalesce(daily.referrals, 0) as referrals,
      coalesce(wl.waitlist, 0) as waitlist
    from days d
    left join daily using (day)
    left join losing_day using (day)
    left join wl using (day)
  )
  select jsonb_build_object(
    'totals', jsonb_build_object(
      'activated',        (select count(distinct anon_id) from e where name = 'activated'),
      'reports',          (select coalesce(sum(reports), 0) from by_day),
      'products_checked', (select coalesce(sum(products_checked), 0) from by_day),
      'products_losing',  (select coalesce(sum(n), 0) from losing),
      'referrals',        (select coalesce(sum(referrals), 0) from by_day),
      'waitlist',         (select count(*) from public.waitlist)
    ),
    'by_day', coalesce((select jsonb_agg(to_jsonb(b) order by b.day) from by_day b), '[]'::jsonb)
  ) into result;
  return result;
end $$;

revoke all on function public.sahi_daam_stats(text) from public;
grant execute on function public.sahi_daam_stats(text) to anon;
