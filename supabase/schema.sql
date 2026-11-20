-- PirateBay initial schema. Run in the Supabase SQL editor as a project owner.
create extension if not exists pgcrypto;

create table if not exists public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  short_name text not null,
  email_domain text,
  meetup_spots text[] not null default '{}',
  is_flagship boolean not null default false
);

insert into public.schools (name, short_name, email_domain, meetup_spots, is_flagship) values
  ('LPU-Cavite', 'LPU-C', 'lpunetwork.edu.ph', array['Main Gate', 'SOT Lobby', 'JPL Hall', 'Phase 2 Canteen'], true),
  ('DLSU-D', 'DLSU-D', 'dlsud.edu.ph', array['Main Gate', 'U Mall', 'Aklatang Emilio Aguinaldo'], false),
  ('CavSU', 'CavSU', 'cvsu.edu.ph', array['Main Gate', 'Student Center', 'Library'], false),
  ('General / Other', 'Other', null, array['Public campus entrance', 'Nearby cafe'], false)
on conflict (name) do update set
  short_name = excluded.short_name,
  email_domain = excluded.email_domain,
  meetup_spots = excluded.meetup_spots,
  is_flagship = excluded.is_flagship;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  alias text not null unique,
  selected_school text not null default 'LPU-Cavite' references public.schools(name),
  trust_tier text not null default 'guest' check (trust_tier in ('guest', 'registered', 'verified_student')),
  verified_domain text,
  strike_count integer not null default 0 check (strike_count >= 0),
  is_banned boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.wall_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  school_name text not null default 'LPU-Cavite' references public.schools(name),
  scope text not null default 'campus' check (scope in ('campus', 'global')),
  category_tag text not null default '#Confession',
  content text not null check (char_length(content) between 1 and 500),
  image_url text,
  upvotes integer not null default 0 check (upvotes >= 0),
  downvotes integer not null default 0 check (downvotes >= 0),
  report_count integer not null default 0 check (report_count >= 0),
  status text not null default 'active' check (status in ('active', 'hidden')),
  created_at timestamptz not null default now()
);

create table if not exists public.wall_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.wall_posts(id) on delete cascade,
  parent_id uuid references public.wall_comments(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 500),
  created_at timestamptz not null default now()
);

create table if not exists public.wall_votes (
  post_id uuid not null references public.wall_posts(id) on delete cascade,
  voter_id uuid not null references public.profiles(id) on delete cascade,
  vote smallint not null check (vote in (-1, 1)),
  created_at timestamptz not null default now(),
  primary key (post_id, voter_id)
);

create table if not exists public.market_listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(id) on delete cascade,
  school_name text not null default 'LPU-Cavite' references public.schools(name),
  title text not null check (char_length(title) between 3 and 90),
  description text not null check (char_length(description) between 1 and 1200),
  price_php numeric(10, 2) not null check (price_php >= 0),
  category text not null,
  condition text not null check (condition in ('New', 'Like New', 'Used')),
  meetup_spot text not null,
  images text[] not null default '{}',
  status text not null default 'available' check (status in ('available', 'reserved', 'sold')),
  created_at timestamptz not null default now(),
  check (cardinality(images) <= 3)
);

create table if not exists public.market_messages (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.market_listings(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 2000),
  created_at timestamptz not null default now(),
  check (sender_id <> receiver_id)
);

create table if not exists public.saved_chats (
  id uuid primary key default gen_random_uuid(),
  participant_a uuid not null references public.profiles(id) on delete cascade,
  participant_b uuid not null references public.profiles(id) on delete cascade,
  saved_a boolean not null default false,
  saved_b boolean not null default false,
  created_at timestamptz not null default now(),
  check (participant_a < participant_b),
  unique (participant_a, participant_b)
);

create table if not exists public.saved_chat_messages (
  id uuid primary key default gen_random_uuid(),
  saved_chat_id uuid not null references public.saved_chats(id) on delete cascade,
  client_message_id text not null,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  alias text not null,
  content text not null,
  sent_at timestamptz not null,
  unique (saved_chat_id, client_message_id)
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('wall_post', 'wall_comment', 'market_listing', 'chat_user')),
  target_id uuid not null,
  reason text not null check (char_length(reason) between 2 and 500),
  created_at timestamptz not null default now(),
  unique (reporter_id, target_type, target_id)
);

create index if not exists wall_posts_feed_idx on public.wall_posts (status, created_at desc);
create index if not exists wall_comments_post_idx on public.wall_comments (post_id, parent_id, created_at);
create index if not exists market_listings_browse_idx on public.market_listings (status, school_name, category, created_at desc);
create index if not exists market_messages_thread_idx on public.market_messages (listing_id, sender_id, receiver_id, created_at);
create index if not exists reports_target_idx on public.reports (target_type, target_id);

-- Create a guest profile as soon as anonymous auth succeeds, then promote confirmed accounts.
create or replace function public.sync_auth_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(coalesce(new.email, ''));
  v_domain text;
  v_tier text;
  v_alias text;
begin
  if v_email like '%@%' then
    v_domain := split_part(v_email, '@', 2);
  else
    v_domain := null;
  end if;

  if new.email_confirmed_at is not null and v_domain like '%.edu.ph' then
    v_tier := 'verified_student';
  elsif new.email_confirmed_at is not null then
    v_tier := 'registered';
  else
    v_tier := 'guest';
  end if;

  loop
    v_alias := 'CrimsonPirate_' || lpad((floor(random() * 10000))::integer::text, 4, '0');
    exit when not exists (select 1 from public.profiles where alias = v_alias);
  end loop;

  insert into public.profiles (id, alias, selected_school, trust_tier, verified_domain)
  values (
    new.id,
    v_alias,
    'LPU-Cavite',
    v_tier,
    case when v_tier = 'verified_student' then v_domain else null end
  )
  on conflict (id) do update set
    trust_tier = excluded.trust_tier,
    verified_domain = excluded.verified_domain;
  return new;
end;
$$;

drop trigger if exists on_auth_user_profile_sync on auth.users;
create trigger on_auth_user_profile_sync
  after insert or update of email, email_confirmed_at, is_anonymous on auth.users
  for each row execute function public.sync_auth_profile();

-- Prevent clients from granting themselves trust, clearing strikes, or unbanning themselves.
create or replace function public.protect_profile_trust_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('service_role', 'postgres') and tg_op = 'INSERT' then
    new.trust_tier := 'guest';
    new.verified_domain := null;
    new.strike_count := 0;
    new.is_banned := false;
    return new;
  end if;
  if current_user not in ('service_role', 'postgres') and tg_op = 'UPDATE' and (
    new.trust_tier is distinct from old.trust_tier or
    new.verified_domain is distinct from old.verified_domain or
    new.strike_count is distinct from old.strike_count or
    new.is_banned is distinct from old.is_banned
  ) then
    raise exception 'Trust and moderation fields are managed by the server';
  end if;
  return new;
end;
$$;
drop trigger if exists protect_profile_trust_fields on public.profiles;
create trigger protect_profile_trust_fields before insert or update on public.profiles
  for each row execute function public.protect_profile_trust_fields();

create or replace function public.protect_wall_aggregates()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('service_role', 'postgres') then
    if tg_op = 'INSERT' then
      new.upvotes := 0;
      new.downvotes := 0;
      new.report_count := 0;
      new.status := 'active';
    elsif new.upvotes is distinct from old.upvotes
      or new.downvotes is distinct from old.downvotes
      or new.report_count is distinct from old.report_count
      or new.status is distinct from old.status then
      raise exception 'Wall vote and moderation fields are managed by the server';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists protect_wall_aggregates on public.wall_posts;
create trigger protect_wall_aggregates before insert or update on public.wall_posts
  for each row execute function public.protect_wall_aggregates();

-- One unique report per person/target; hide a wall post at three independent reports.
create or replace function public.apply_report()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if new.target_type = 'wall_post' then
    select count(*) into v_count from public.reports
      where target_type = new.target_type and target_id = new.target_id;
    update public.wall_posts
      set report_count = v_count,
          status = case when v_count >= 3 then 'hidden' else status end
      where id = new.target_id;
  end if;
  return new;
end;
$$;
drop trigger if exists after_report_insert on public.reports;
create trigger after_report_insert after insert on public.reports
  for each row execute function public.apply_report();

-- Keep the denormalized score synchronized with the per-user vote ledger.
create or replace function public.refresh_wall_vote_score()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post_id uuid := coalesce(new.post_id, old.post_id);
begin
  update public.wall_posts
    set upvotes = coalesce((select count(*) from public.wall_votes where post_id = v_post_id and vote = 1), 0),
        downvotes = coalesce((select count(*) from public.wall_votes where post_id = v_post_id and vote = -1), 0)
    where id = v_post_id;
  return coalesce(new, old);
end;
$$;
drop trigger if exists refresh_wall_vote_score on public.wall_votes;
create trigger refresh_wall_vote_score after insert or update or delete on public.wall_votes
  for each row execute function public.refresh_wall_vote_score();

alter table public.schools enable row level security;
alter table public.profiles enable row level security;
alter table public.wall_posts enable row level security;
alter table public.wall_comments enable row level security;
alter table public.wall_votes enable row level security;
alter table public.market_listings enable row level security;
alter table public.market_messages enable row level security;
alter table public.saved_chats enable row level security;
alter table public.saved_chat_messages enable row level security;
alter table public.reports enable row level security;

create policy "Schools are readable by everyone" on public.schools for select using (true);
create policy "Profiles are visible to signed-in students" on public.profiles for select to authenticated using (not is_banned);
create policy "Users can create their own profile" on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "Users can edit their public profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "Active wall posts are readable" on public.wall_posts for select to authenticated using (status = 'active');
create policy "Non-banned users can publish wall posts" on public.wall_posts for insert to authenticated
  with check (author_id = auth.uid() and exists (select 1 from public.profiles p where p.id = auth.uid() and not p.is_banned));
create policy "Authors can edit their wall posts" on public.wall_posts for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy "Authors can delete their wall posts" on public.wall_posts for delete to authenticated using (author_id = auth.uid());

create policy "Comments on active posts are readable" on public.wall_comments for select to authenticated
  using (exists (select 1 from public.wall_posts p where p.id = post_id and p.status = 'active'));
create policy "Signed-in users can comment" on public.wall_comments for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and not p.is_banned)
    and exists (select 1 from public.wall_posts p where p.id = wall_comments.post_id and p.status = 'active')
    and (wall_comments.parent_id is null or exists (select 1 from public.wall_comments parent where parent.id = wall_comments.parent_id and parent.post_id = wall_comments.post_id))
  );
create policy "Authors can delete their comments" on public.wall_comments for delete to authenticated using (author_id = auth.uid());

create policy "Votes are visible to signed-in students" on public.wall_votes for select to authenticated using (true);
create policy "Users can cast their own vote" on public.wall_votes for insert to authenticated with check (voter_id = auth.uid());
create policy "Users can change their own vote" on public.wall_votes for update to authenticated using (voter_id = auth.uid()) with check (voter_id = auth.uid());
create policy "Users can remove their own vote" on public.wall_votes for delete to authenticated using (voter_id = auth.uid());

create policy "Listings are browseable by signed-in students" on public.market_listings for select to authenticated using (true);
create policy "Members can publish listings" on public.market_listings for insert to authenticated
  with check (
    seller_id = auth.uid() and exists (
      select 1 from public.profiles p where p.id = auth.uid()
        and p.trust_tier in ('registered', 'verified_student') and not p.is_banned
    )
  );
create policy "Sellers can update their listings" on public.market_listings for update to authenticated using (seller_id = auth.uid()) with check (seller_id = auth.uid());
create policy "Sellers can delete their listings" on public.market_listings for delete to authenticated using (seller_id = auth.uid());

create policy "Conversation participants can read messages" on public.market_messages for select to authenticated
  using (sender_id = auth.uid() or receiver_id = auth.uid());
create policy "Buyers can start a listing conversation" on public.market_messages for insert to authenticated
  with check (
    sender_id = auth.uid() and exists (
      select 1 from public.market_listings l where l.id = listing_id
        and l.seller_id = receiver_id and l.seller_id <> auth.uid()
    )
  );
create policy "Participants can reply in an existing conversation" on public.market_messages for insert to authenticated
  with check (
    sender_id = auth.uid() and exists (
      select 1 from public.market_messages prior
      where prior.listing_id = market_messages.listing_id
        and ((prior.sender_id = auth.uid() and prior.receiver_id = market_messages.receiver_id)
          or (prior.receiver_id = auth.uid() and prior.sender_id = market_messages.receiver_id))
    )
  );

create policy "Participants can read saved chats" on public.saved_chats for select to authenticated
  using (participant_a = auth.uid() or participant_b = auth.uid());
create policy "Participants can read saved chat messages" on public.saved_chat_messages for select to authenticated
  using (exists (select 1 from public.saved_chats s where s.id = saved_chat_id and (s.participant_a = auth.uid() or s.participant_b = auth.uid())));

-- Each participant must consent separately. Message history is copied only when both consent.
create or replace function public.save_chat(p_other uuid, p_messages jsonb)
returns table (chat_id uuid, mutual_saved boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_self uuid := auth.uid();
  v_chat public.saved_chats%rowtype;
begin
  if v_self is null or p_other is null or v_self = p_other then
    raise exception 'A signed-in chat participant is required';
  end if;
  if not exists (select 1 from public.profiles where id = v_self and trust_tier in ('registered', 'verified_student')) then
    raise exception 'Register your account before saving chats';
  end if;

  insert into public.saved_chats as saved (participant_a, participant_b, saved_a, saved_b)
  values (least(v_self, p_other), greatest(v_self, p_other), v_self < p_other, v_self > p_other)
  on conflict (participant_a, participant_b) do update set
    saved_a = saved.saved_a or (v_self < p_other),
    saved_b = saved.saved_b or (v_self > p_other)
  returning * into v_chat;

  if v_chat.saved_a and v_chat.saved_b then
    insert into public.saved_chat_messages (saved_chat_id, client_message_id, sender_id, alias, content, sent_at)
    select v_chat.id,
      coalesce(item->>'id', gen_random_uuid()::text),
      (item->>'senderId')::uuid,
      coalesce(item->>'alias', 'Campus Pal'),
      coalesce(item->>'text', ''),
      coalesce((item->>'sentAt')::timestamptz, now())
    from jsonb_array_elements(coalesce(p_messages, '[]'::jsonb)) item
    where coalesce(item->>'text', '') <> ''
    on conflict (saved_chat_id, client_message_id) do nothing;
  end if;
  return query select v_chat.id, (v_chat.saved_a and v_chat.saved_b);
end;
$$;
revoke all on function public.save_chat(uuid, jsonb) from public;
grant execute on function public.save_chat(uuid, jsonb) to authenticated;

create policy "Users can report as themselves" on public.reports for insert to authenticated
  with check (reporter_id = auth.uid());
create policy "Users can see their own reports" on public.reports for select to authenticated using (reporter_id = auth.uid());

-- Table privileges are explicit; RLS remains the row-level authority for every request.
grant usage on schema public to anon, authenticated;
grant select on public.schools to anon, authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.wall_posts to authenticated;
grant select, insert, delete on public.wall_comments to authenticated;
grant select, insert, update, delete on public.wall_votes to authenticated;
grant select, insert, update, delete on public.market_listings to authenticated;
grant select, insert on public.market_messages to authenticated;
grant select on public.saved_chats, public.saved_chat_messages to authenticated;
grant select, insert on public.reports to authenticated;

-- Public listing photos and wall uploads; object paths must start with the uploader's auth UUID.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('campus-uploads', 'campus-uploads', true, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
create policy "Campus uploads are publicly readable" on storage.objects for select using (bucket_id = 'campus-uploads');
create policy "Users can upload into their own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'campus-uploads' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Users can update their own uploads" on storage.objects for update to authenticated
  using (bucket_id = 'campus-uploads' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'campus-uploads' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Users can delete their own uploads" on storage.objects for delete to authenticated
  using (bucket_id = 'campus-uploads' and (storage.foldername(name))[1] = auth.uid()::text);

-- Realtime: enable publication for persistent marketplace conversations.
do $$ begin
  alter publication supabase_realtime add table public.market_messages;
exception when duplicate_object then null;
end $$;

-- A private room topic contains both participant UUIDs, so only either participant can subscribe/broadcast.
create policy "Chat participants can read private room events" on realtime.messages
  for select to authenticated
  using (
    extension in ('broadcast', 'presence') and realtime.topic() like 'room:%'
    and realtime.topic() ~ ('(^|:)' || auth.uid()::text || '(:|$)')
  );
create policy "Chat participants can send private room events" on realtime.messages
  for insert to authenticated
  with check (
    extension in ('broadcast', 'presence') and realtime.topic() like 'room:%'
    and realtime.topic() ~ ('(^|:)' || auth.uid()::text || '(:|$)')
  );
