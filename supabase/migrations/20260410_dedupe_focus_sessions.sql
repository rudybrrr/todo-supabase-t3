-- Removes impossible near-duplicate focus sessions created by repeated completion inserts.
-- Two identical sessions cannot legitimately finish faster than the session duration itself,
-- so rows inserted significantly sooner than that are treated as duplicate echoes.

with ordered_sessions as (
  select
    id,
    inserted_at,
    duration_seconds,
    lag(inserted_at) over (
      partition by
        user_id,
        coalesce(list_id::text, ''),
        mode,
        duration_seconds
      order by inserted_at, id
    ) as previous_inserted_at
  from public.focus_sessions
),
duplicate_sessions as (
  select id
  from ordered_sessions
  where previous_inserted_at is not null
    and inserted_at - previous_inserted_at
      < make_interval(secs => greatest(duration_seconds - 30, 30))
)
delete from public.focus_sessions
where id in (select id from duplicate_sessions);
