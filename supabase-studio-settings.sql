-- À exécuter une seule fois dans Supabase > SQL Editor.

create table if not exists public.studio_settings (
  id integer primary key check (id = 1),
  opening_time time not null default '09:00',
  closing_time time not null default '20:00',
  default_slot_duration integer not null default 60 check (default_slot_duration > 0),
  updated_by uuid null,
  updated_at timestamptz not null default now()
);

insert into public.studio_settings (id)
values (1)
on conflict (id) do nothing;

alter table public.admins
  add column if not exists role text not null default 'photographe';

alter table public.admins
  drop constraint if exists admins_role_check;

alter table public.admins
  add constraint admins_role_check
  check (role in ('photographe', 'developer'));

-- Exemple pour désigner un compte comme développeur :
-- update public.admins set role = 'developer' where email = 'dev@example.com';
