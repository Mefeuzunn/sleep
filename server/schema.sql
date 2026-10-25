-- Sleep Events tablosu (Ses olayları kaydı)
create extension if not exists "uuid-ossp";

create table if not exists sleep_events (
  id uuid default uuid_generate_v4() primary key,
  session_id text, -- O geceki uykuyu gruplamak için (örneğin tarih: "2026-10-25")
  event_type text, -- 'snore', 'speech', 'cough'
  transcript text, -- Eğer speech ise konuşma metni
  confidence numeric,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- Hareket Verileri Tablosu (İvmeölçer hareket yoğunluğu)
create table if not exists sleep_movements (
  id uuid default uuid_generate_v4() primary key,
  session_id text, -- O geceki uyku oturumu
  intensity numeric, -- Yerçekiminden arındırılmış net hareket şiddeti (|sqrt(x²+y²+z²) - 9.81|)
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- RLS Güvenlik Politikaları
alter table sleep_events enable row level security;
alter table sleep_movements enable row level security;

create policy "Allow public read sleep_events" on sleep_events for select using (true);
create policy "Allow public insert sleep_events" on sleep_events for insert with check (true);
create policy "Allow public update sleep_events" on sleep_events for update using (true);
create policy "Allow public delete sleep_events" on sleep_events for delete using (true);

create policy "Allow public read sleep_movements" on sleep_movements for select using (true);
create policy "Allow public insert sleep_movements" on sleep_movements for insert with check (true);
create policy "Allow public update sleep_movements" on sleep_movements for update using (true);
create policy "Allow public delete sleep_movements" on sleep_movements for delete using (true);
