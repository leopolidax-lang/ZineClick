-- Zynora · esquema de Supabase. Ejecútalo completo en SQL Editor (una sola vez).

create table if not exists public.user_items (
  user_id    uuid not null references auth.users(id) on delete cascade,
  list       text not null check (list in ('watchlist','favorites','watched')),
  item_id    text not null check (item_id ~ '^[A-Za-z0-9_-]{1,40}$'),
  deleted    boolean not null default false,
  data       jsonb check (data is null or pg_column_size(data) < 4096),
  updated_at timestamptz not null default now(),       -- hora del cambio (cliente, limitada)
  synced_at  timestamptz not null default clock_timestamp(), -- hora de llegada al servidor
  primary key (user_id, list, item_id)
);
create index if not exists user_items_sync_idx on public.user_items (user_id, synced_at);

create table if not exists public.user_kv (
  user_id    uuid not null references auth.users(id) on delete cascade,
  key        text not null check (key in ('taste','settings','profile','region')),
  value      jsonb not null check (pg_column_size(value) < 65536),
  updated_at timestamptz not null default now(),
  synced_at  timestamptz not null default clock_timestamp(),
  primary key (user_id, key)
);
create index if not exists user_kv_sync_idx on public.user_kv (user_id, synced_at);

-- Última escritura gana: un cambio más viejo que el guardado se ignora en silencio.
create or replace function public.zs_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return null;
  end if;
  new.updated_at := least(new.updated_at, now() + interval '5 minutes');
  new.synced_at  := clock_timestamp();
  return new;
end $$;

drop trigger if exists user_items_guard on public.user_items;
create trigger user_items_guard before insert or update on public.user_items
  for each row execute function public.zs_guard();
drop trigger if exists user_kv_guard on public.user_kv;
create trigger user_kv_guard before insert or update on public.user_kv
  for each row execute function public.zs_guard();

-- Seguridad: cada persona solo ve y toca sus filas.
alter table public.user_items enable row level security;
alter table public.user_kv    enable row level security;

drop policy if exists "items_own" on public.user_items;
create policy "items_own" on public.user_items for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "kv_own" on public.user_kv;
create policy "kv_own" on public.user_kv for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on public.user_items, public.user_kv from anon;
grant select, insert, update, delete on public.user_items, public.user_kv to authenticated;

-- Borrar la propia cuenta (Google Play lo exige si la app permite crear cuentas).
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from auth.users where id = (select auth.uid());
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
