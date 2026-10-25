-- 1. UUID Uzantısı
create extension if not exists "uuid-ossp";

-- 2. Sleep Events Tablosu (Ses Olayları)
create table if not exists sleep_events (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade default auth.uid(),
  session_id text, -- O geceki uyku seansı (örn: "2026-10-25")
  event_type text not null, -- 'snore', 'speech', 'cough'
  transcript text, -- Whisper konuşma metni
  confidence numeric,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- Eğer tablo önceden oluşturulmuşsa ve user_id yoksa ekle:
do $$
begin
  if not exists (select 1 from information_schema.columns where table_name='sleep_events' and column_name='user_id') then
    alter table sleep_events add column user_id uuid references auth.users(id) on delete cascade default auth.uid();
  end if;
end $$;

-- 3. Sleep Movements Tablosu (İvmeölçer Hareket Verileri)
create table if not exists sleep_movements (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade default auth.uid(),
  session_id text,
  intensity numeric,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

do $$
begin
  if not exists (select 1 from information_schema.columns where table_name='sleep_movements' and column_name='user_id') then
    alter table sleep_movements add column user_id uuid references auth.users(id) on delete cascade default auth.uid();
  end if;
end $$;

-- 4. Row Level Security (RLS) Aktifleştir
alter table sleep_events enable row level security;
alter table sleep_movements enable row level security;

-- 5. RLS Politikaları (Kullanıcılar sadece kendi verilerini okuyup yazabilir)
drop policy if exists "Sadece kendi verilerini görebilir" on sleep_events;
create policy "Sadece kendi verilerini görebilir" on sleep_events
  for all using (auth.uid() = user_id or user_id is null)
  with check (auth.uid() = user_id or user_id is null);

drop policy if exists "Sadece kendi hareketlerini görebilir" on sleep_movements;
create policy "Sadece kendi hareketlerini görebilir" on sleep_movements
  for all using (auth.uid() = user_id or user_id is null)
  with check (auth.uid() = user_id or user_id is null);
