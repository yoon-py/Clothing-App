-- ============================================================
-- Unified Supabase migration (idempotent)
-- Copy-paste this whole file into Supabase SQL Editor and Run.
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- 1) Tables
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nickname      TEXT NOT NULL DEFAULT '',
  avatar_url    TEXT,
  location_name TEXT,
  location      GEOMETRY(Point, 4326),
  rating        NUMERIC DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  description   TEXT,
  category      TEXT NOT NULL,
  size          TEXT,
  brand         TEXT,
  price         INTEGER NOT NULL,
  condition     TEXT,
  status        TEXT DEFAULT 'selling',
  images        TEXT[] NOT NULL DEFAULT '{}',
  location_name TEXT,
  location      GEOMETRY(Point, 4326),
  lat           DOUBLE PRECISION,
  lng           DOUBLE PRECISION,
  views         INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;

ALTER TABLE public.items ALTER COLUMN condition DROP NOT NULL;

ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS trade_place_name TEXT,
  ADD COLUMN IF NOT EXISTS trade_place_lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS trade_place_lng DOUBLE PRECISION;

CREATE TABLE IF NOT EXISTS public.likes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id    UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, item_id)
);

CREATE TABLE IF NOT EXISTS public.posts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  content     TEXT,
  images      TEXT[] NOT NULL DEFAULT '{}',
  tags        TEXT[] NOT NULL DEFAULT '{}',
  likes_count INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.post_likes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.post_comments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  author_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.post_chat_rooms (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id      UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  initiator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  owner_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (post_id, initiator_id, owner_id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'post_chat_rooms_initiator_not_owner'
      AND conrelid = 'public.post_chat_rooms'::regclass
  ) THEN
    ALTER TABLE public.post_chat_rooms
      ADD CONSTRAINT post_chat_rooms_initiator_not_owner CHECK (initiator_id <> owner_id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.post_chat_messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id    UUID NOT NULL REFERENCES public.post_chat_rooms(id) ON DELETE CASCADE,
  sender_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.rooms (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id    UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  buyer_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  seller_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (item_id, buyer_id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'rooms_buyer_not_seller'
      AND conrelid = 'public.rooms'::regclass
  ) THEN
    ALTER TABLE public.rooms
      ADD CONSTRAINT rooms_buyer_not_seller CHECK (buyer_id <> seller_id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id    UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  sender_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 2) Data backfill for coordinates
-- ============================================================
UPDATE public.items
SET
  lat = COALESCE(lat, ST_Y(location)),
  lng = COALESCE(lng, ST_X(location))
WHERE location IS NOT NULL
  AND (lat IS NULL OR lng IS NULL);

UPDATE public.items
SET location = ST_SetSRID(ST_MakePoint(lng, lat), 4326)
WHERE location IS NULL
  AND lat IS NOT NULL
  AND lng IS NOT NULL;

UPDATE public.posts p
SET likes_count = COALESCE((
  SELECT COUNT(*)::INTEGER
  FROM public.post_likes pl
  WHERE pl.post_id = p.id
), 0);

-- ============================================================
-- 3) Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS items_location_idx          ON public.items USING GIST(location);
CREATE INDEX IF NOT EXISTS profiles_location_idx       ON public.profiles USING GIST(location);
CREATE INDEX IF NOT EXISTS items_status_idx            ON public.items(status);
CREATE INDEX IF NOT EXISTS items_created_at_idx        ON public.items(created_at DESC);
CREATE INDEX IF NOT EXISTS items_lat_lng_idx           ON public.items(lat, lng);

CREATE INDEX IF NOT EXISTS likes_user_created_idx      ON public.likes(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS likes_item_idx              ON public.likes(item_id);

CREATE INDEX IF NOT EXISTS posts_created_at_idx        ON public.posts(created_at DESC);
CREATE INDEX IF NOT EXISTS post_likes_post_idx         ON public.post_likes(post_id);
CREATE INDEX IF NOT EXISTS post_likes_user_created_idx ON public.post_likes(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS post_comments_post_created_idx
  ON public.post_comments(post_id, created_at ASC);
CREATE INDEX IF NOT EXISTS post_chat_rooms_initiator_created_idx
  ON public.post_chat_rooms(initiator_id, created_at DESC);
CREATE INDEX IF NOT EXISTS post_chat_rooms_owner_created_idx
  ON public.post_chat_rooms(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS post_chat_rooms_post_idx
  ON public.post_chat_rooms(post_id);
CREATE INDEX IF NOT EXISTS post_chat_messages_room_created_idx
  ON public.post_chat_messages(room_id, created_at DESC);

CREATE INDEX IF NOT EXISTS rooms_buyer_created_idx     ON public.rooms(buyer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS rooms_seller_created_idx    ON public.rooms(seller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS rooms_item_idx              ON public.rooms(item_id);

CREATE INDEX IF NOT EXISTS messages_room_created_idx   ON public.messages(room_id, created_at DESC);

-- ============================================================
-- 4) Trigger: auto-create profile on auth user signup
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, nickname)
  VALUES (NEW.id, 'user_' || floor(extract(epoch from now()))::text)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 5) RPC: nearby items (PostGIS)
-- ============================================================
DROP FUNCTION IF EXISTS public.get_nearby_items(double precision, double precision, double precision, integer, text);

CREATE OR REPLACE FUNCTION public.get_nearby_items(
  q_lat           double precision,
  q_lng           double precision,
  radius_meters   double precision DEFAULT 3000,
  cursor_offset   integer          DEFAULT 0,
  category_filter text             DEFAULT NULL
)
RETURNS TABLE (
  id                uuid,
  title             text,
  price             integer,
  category          text,
  size              text,
  brand             text,
  condition         text,
  status            text,
  images            text[],
  location_name     text,
  lat               double precision,
  lng               double precision,
  created_at        timestamptz,
  seller_id         uuid,
  seller_nickname   text,
  seller_avatar_url text,
  seller_rating     numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    i.id,
    i.title,
    i.price,
    i.category,
    i.size,
    i.brand,
    i.condition,
    i.status,
    i.images,
    i.location_name,
    COALESCE(i.lat, ST_Y(i.location)) AS lat,
    COALESCE(i.lng, ST_X(i.location)) AS lng,
    i.created_at,
    i.seller_id,
    p.nickname   AS seller_nickname,
    p.avatar_url AS seller_avatar_url,
    p.rating     AS seller_rating
  FROM public.items i
  LEFT JOIN public.profiles p ON i.seller_id = p.id
  WHERE ST_DWithin(
    i.location::geography,
    ST_MakePoint(q_lng, q_lat)::geography,
    radius_meters
  )
  AND i.status = 'selling'
  AND (category_filter IS NULL OR i.category = category_filter)
  ORDER BY i.created_at DESC
  LIMIT 20
  OFFSET cursor_offset;
END;
$$;

-- ============================================================
-- 6) RPC: increment views
-- ============================================================
CREATE OR REPLACE FUNCTION public.increment_item_views(item_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE public.items SET views = views + 1 WHERE id = item_id;
$$;

-- ============================================================
-- 7) Trigger: sync post likes_count
-- ============================================================
CREATE OR REPLACE FUNCTION public.sync_post_likes_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts
    SET likes_count = COALESCE(likes_count, 0) + 1
    WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.posts
    SET likes_count = GREATEST(COALESCE(likes_count, 0) - 1, 0)
    WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_post_likes_insert ON public.post_likes;
CREATE TRIGGER trg_post_likes_insert
  AFTER INSERT ON public.post_likes
  FOR EACH ROW EXECUTE FUNCTION public.sync_post_likes_count();

DROP TRIGGER IF EXISTS trg_post_likes_delete ON public.post_likes;
CREATE TRIGGER trg_post_likes_delete
  AFTER DELETE ON public.post_likes
  FOR EACH ROW EXECUTE FUNCTION public.sync_post_likes_count();

-- ============================================================
-- 8) RLS + Policies
-- ============================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.likes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_likes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_comments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_chat_rooms    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Profiles
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Items
DROP POLICY IF EXISTS "items_select" ON public.items;
DROP POLICY IF EXISTS "items_insert" ON public.items;
DROP POLICY IF EXISTS "items_update" ON public.items;
CREATE POLICY "items_select" ON public.items FOR SELECT USING (true);
CREATE POLICY "items_insert" ON public.items FOR INSERT WITH CHECK (auth.uid() = seller_id);
CREATE POLICY "items_update" ON public.items FOR UPDATE USING (auth.uid() = seller_id);

-- Likes
DROP POLICY IF EXISTS "likes_select" ON public.likes;
DROP POLICY IF EXISTS "likes_insert" ON public.likes;
DROP POLICY IF EXISTS "likes_delete" ON public.likes;
CREATE POLICY "likes_select" ON public.likes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "likes_insert" ON public.likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "likes_delete" ON public.likes FOR DELETE USING (auth.uid() = user_id);

-- Posts
DROP POLICY IF EXISTS "posts_select" ON public.posts;
DROP POLICY IF EXISTS "posts_insert" ON public.posts;
DROP POLICY IF EXISTS "posts_update" ON public.posts;
DROP POLICY IF EXISTS "posts_delete" ON public.posts;
CREATE POLICY "posts_select" ON public.posts FOR SELECT USING (true);
CREATE POLICY "posts_insert" ON public.posts FOR INSERT WITH CHECK (auth.uid() = author_id);
CREATE POLICY "posts_update" ON public.posts FOR UPDATE USING (auth.uid() = author_id);
CREATE POLICY "posts_delete" ON public.posts FOR DELETE USING (auth.uid() = author_id);

-- Post Likes
DROP POLICY IF EXISTS "post_likes_select" ON public.post_likes;
DROP POLICY IF EXISTS "post_likes_insert" ON public.post_likes;
DROP POLICY IF EXISTS "post_likes_delete" ON public.post_likes;
CREATE POLICY "post_likes_select" ON public.post_likes FOR SELECT USING (true);
CREATE POLICY "post_likes_insert" ON public.post_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "post_likes_delete" ON public.post_likes FOR DELETE USING (auth.uid() = user_id);

-- Post Comments
DROP POLICY IF EXISTS "post_comments_select" ON public.post_comments;
DROP POLICY IF EXISTS "post_comments_insert" ON public.post_comments;
DROP POLICY IF EXISTS "post_comments_update" ON public.post_comments;
DROP POLICY IF EXISTS "post_comments_delete" ON public.post_comments;
CREATE POLICY "post_comments_select" ON public.post_comments FOR SELECT USING (true);
CREATE POLICY "post_comments_insert" ON public.post_comments FOR INSERT WITH CHECK (auth.uid() = author_id);
CREATE POLICY "post_comments_update" ON public.post_comments FOR UPDATE USING (auth.uid() = author_id);
CREATE POLICY "post_comments_delete" ON public.post_comments FOR DELETE USING (auth.uid() = author_id);

-- Post Chat Rooms
DROP POLICY IF EXISTS "post_chat_rooms_select" ON public.post_chat_rooms;
DROP POLICY IF EXISTS "post_chat_rooms_insert" ON public.post_chat_rooms;
DROP POLICY IF EXISTS "post_chat_rooms_update" ON public.post_chat_rooms;
DROP POLICY IF EXISTS "post_chat_rooms_delete" ON public.post_chat_rooms;
CREATE POLICY "post_chat_rooms_select" ON public.post_chat_rooms
  FOR SELECT
  USING (auth.uid() = initiator_id OR auth.uid() = owner_id);
CREATE POLICY "post_chat_rooms_insert" ON public.post_chat_rooms
  FOR INSERT
  WITH CHECK (auth.uid() = initiator_id);
CREATE POLICY "post_chat_rooms_update" ON public.post_chat_rooms
  FOR UPDATE
  USING (auth.uid() = initiator_id OR auth.uid() = owner_id);
CREATE POLICY "post_chat_rooms_delete" ON public.post_chat_rooms
  FOR DELETE
  USING (auth.uid() = initiator_id OR auth.uid() = owner_id);

-- Post Chat Messages
DROP POLICY IF EXISTS "post_chat_messages_select" ON public.post_chat_messages;
DROP POLICY IF EXISTS "post_chat_messages_insert" ON public.post_chat_messages;
CREATE POLICY "post_chat_messages_select" ON public.post_chat_messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.post_chat_rooms r
      WHERE r.id = room_id
        AND (r.initiator_id = auth.uid() OR r.owner_id = auth.uid())
    )
  );
CREATE POLICY "post_chat_messages_insert" ON public.post_chat_messages
  FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (
      SELECT 1
      FROM public.post_chat_rooms r
      WHERE r.id = room_id
        AND (r.initiator_id = auth.uid() OR r.owner_id = auth.uid())
    )
  );

-- Rooms
DROP POLICY IF EXISTS "rooms_select" ON public.rooms;
DROP POLICY IF EXISTS "rooms_insert" ON public.rooms;
DROP POLICY IF EXISTS "rooms_update" ON public.rooms;
DROP POLICY IF EXISTS "rooms_delete" ON public.rooms;
CREATE POLICY "rooms_select" ON public.rooms FOR SELECT USING (auth.uid() = buyer_id OR auth.uid() = seller_id);
CREATE POLICY "rooms_insert" ON public.rooms FOR INSERT WITH CHECK (auth.uid() = buyer_id);
CREATE POLICY "rooms_update" ON public.rooms FOR UPDATE USING (auth.uid() = buyer_id OR auth.uid() = seller_id);
CREATE POLICY "rooms_delete" ON public.rooms FOR DELETE USING (auth.uid() = buyer_id OR auth.uid() = seller_id);

-- Messages
DROP POLICY IF EXISTS "messages_select" ON public.messages;
DROP POLICY IF EXISTS "messages_insert" ON public.messages;
CREATE POLICY "messages_select" ON public.messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.rooms r
      WHERE r.id = room_id
        AND (r.buyer_id = auth.uid() OR r.seller_id = auth.uid())
    )
  );

CREATE POLICY "messages_insert" ON public.messages
  FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (
      SELECT 1
      FROM public.rooms r
      WHERE r.id = room_id
        AND (r.buyer_id = auth.uid() OR r.seller_id = auth.uid())
    )
  );

COMMIT;
