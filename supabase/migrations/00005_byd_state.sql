-- BYD polling state: one row per organization tracks the current trip and poll state
create table if not exists byd_poll_state (
    org_id          uuid primary key references organizations(id) on delete cascade,
    active_trip_id  uuid references trips(id) on delete set null,
    last_odometer   numeric,           -- km at last poll
    last_speed      numeric,           -- km/h at last poll
    last_lat        double precision,
    last_lon        double precision,
    stopped_since   timestamptz,       -- when speed first dropped to 0
    last_polled_at  timestamptz,
    -- BYD session cache: avoid re-login every 5 minutes
    byd_user_id     text,
    byd_sign_token  text,
    byd_encry_token text,
    byd_session_expires_at timestamptz,
    updated_at      timestamptz default now()
);

alter table byd_poll_state enable row level security;

-- Only service role writes; no direct user access needed
create policy "service role only" on byd_poll_state
    using (false);
