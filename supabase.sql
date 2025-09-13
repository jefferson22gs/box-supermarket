-- Supabase SQL to create tables for Extended POS
create table if not exists public.products (
  id text primary key,
  name text not null,
  barcode text unique,
  price numeric not null default 0,
  qty int not null default 0,
  created_at timestamptz default timezone('utc'::text, now())
);

create table if not exists public.sales (
  id text primary key,
  datetime timestamptz not null,
  payload jsonb not null,
  created_at timestamptz default timezone('utc'::text, now())
);

create table if not exists public.store_info (
  id text primary key,
  name text,
  cnpj text,
  address text,
  phone text,
  logo_base64 text,
  updated_at timestamptz default timezone('utc'::text, now())
);

create table if not exists public.cash_closures (
  id text primary key,
  date timestamptz not null,
  total numeric,
  details jsonb,
  created_at timestamptz default timezone('utc'::text, now())
);

-- For prototyping you may grant anon permissions; in production enable RLS and policies.
grant select, insert, update, delete on public.products to anon;
grant select, insert on public.sales to anon;
grant select, insert, update on public.store_info to anon;
grant select, insert on public.cash_closures to anon;
