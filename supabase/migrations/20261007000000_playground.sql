-- 公共 Playground：所有写操作只能通过 Edge Function 完成。
-- IP 与发布者令牌只保留加盐哈希，避免把可识别原值写入数据库。
create extension if not exists pgcrypto;

create table if not exists public.playground_entries (
  id uuid primary key,
  client_ip_hash text not null,
  owner_token_hash text not null,
  note jsonb not null,
  image_paths jsonb not null default '[]'::jsonb,
  image_count integer not null default 0 check (image_count >= 0 and image_count <= 3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '48 hours')
);

create index if not exists playground_entries_expiry_idx on public.playground_entries (expires_at);
create index if not exists playground_entries_ip_expiry_idx on public.playground_entries (client_ip_hash, expires_at);

alter table public.playground_entries enable row level security;
-- No public policies: anon clients read/write only through the Edge Function.

-- 配额检查和写入必须在同一事务内完成。每个 IP 哈希使用 advisory lock，避免并发
-- 请求都先通过计数、再一起插入而绕过限制。
create or replace function public.create_playground_entry(
  p_id uuid,
  p_client_ip_hash text,
  p_owner_token_hash text,
  p_note jsonb,
  p_image_paths jsonb,
  p_image_count integer,
  p_created_at timestamptz,
  p_expires_at timestamptz
)
returns public.playground_entries
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_entry_count integer;
  v_image_count integer;
  v_row public.playground_entries;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_client_ip_hash, 0));

  select count(*), coalesce(sum(image_count), 0)
  into v_entry_count, v_image_count
  from public.playground_entries
  where client_ip_hash = p_client_ip_hash
    and created_at > now() - interval '48 hours';

  if v_entry_count >= 24 then
    raise exception '同一网络在 48 小时内最多可发布 24 条记录。';
  end if;
  if v_image_count + p_image_count > 6 then
    raise exception '同一网络在 48 小时内最多可发布 6 张图片。';
  end if;

  insert into public.playground_entries (
    id, client_ip_hash, owner_token_hash, note, image_paths, image_count,
    created_at, updated_at, expires_at
  ) values (
    p_id, p_client_ip_hash, p_owner_token_hash, p_note, p_image_paths, p_image_count,
    p_created_at, p_created_at, p_expires_at
  )
  returning * into v_row;
  return v_row;
end;
$$;

revoke all on function public.create_playground_entry(uuid, text, text, jsonb, jsonb, integer, timestamptz, timestamptz)
from public, anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'playground-media',
  'playground-media',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- 不给 anon/authenticated 写入 Storage 的策略；Edge Function 使用 service_role 写入。
