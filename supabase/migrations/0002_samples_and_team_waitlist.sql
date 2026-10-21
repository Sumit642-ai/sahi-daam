-- Sahi Daam: keep demo and team data out of /stats. Run once after 0001, in the Supabase SQL editor.
--
--   - Waitlist rows carry a team flag: sign-ups from a team device (?team=1) don't count.
--   - Report uploads from the built-in sample report (props.sample = true) don't count as
--     reports or as products checked. The app never sends 'activated' for sample-only data.

alter table public.waitlist add column if not exists team boolean not null default false;
grant insert (contact, consent, lang, team) on public.waitlist to anon;

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
      and not (name = 'report_uploaded' and coalesce(props->>'sample', 'false') = 'true')
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
  w as (select created_at::date as day from public.waitlist where not team),
  wl as (select day, count(*) as waitlist from w group by 1),
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
      'waitlist',         (select count(*) from w)
    ),
    'by_day', coalesce((select jsonb_agg(to_jsonb(b) order by b.day) from by_day b), '[]'::jsonb)
  ) into result;
  return result;
end $$;

revoke all on function public.sahi_daam_stats(text) from public;
grant execute on function public.sahi_daam_stats(text) to anon;
