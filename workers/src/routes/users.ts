import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import { getSupabase } from '../lib/supabase';
import { serializeProfile } from '../lib/serializers';

const users = new Hono<{
  Bindings: { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string };
  Variables: { userId: string; userPhone: string };
}>();

users.get('/:id', async (c) => {
  const id = c.req.param('id');
  const supabase = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, nickname, avatar_url, location_name, rating, created_at')
    .eq('id', id)
    .single();

  if (error || !profile) {
    return c.json({ error: 'User not found' }, 404);
  }

  return c.json(serializeProfile(profile));
});

users.patch('/me', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json<{
    nickname?: string;
    avatarUrl?: string;
    locationName?: string;
    lat?: number;
    lng?: number;
  }>();

  const supabase = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);

  const updateData: Record<string, any> = {};
  if (body.nickname !== undefined) {
    const nickname = body.nickname.trim();
    if (nickname.length < 2 || nickname.length > 20) {
      return c.json({ error: 'nickname must be between 2 and 20 characters' }, 400);
    }
    updateData.nickname = nickname;
  }

  if (body.avatarUrl !== undefined) {
    updateData.avatar_url = body.avatarUrl.trim() || null;
  }

  if (body.locationName !== undefined) {
    updateData.location_name = body.locationName.trim() || null;
  }

  if (body.lat !== undefined || body.lng !== undefined) {
    if (typeof body.lat !== 'number' || typeof body.lng !== 'number') {
      return c.json({ error: 'lat and lng should be provided together' }, 400);
    }
    if (body.lat < -90 || body.lat > 90 || body.lng < -180 || body.lng > 180) {
      return c.json({ error: 'Invalid coordinate range' }, 400);
    }
    updateData.location = `SRID=4326;POINT(${body.lng} ${body.lat})`;
  }

  if (Object.keys(updateData).length === 0) {
    return c.json({ error: 'Nothing to update' }, 400);
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .update(updateData)
    .eq('id', userId)
    .select('id, nickname, avatar_url, location_name, rating, created_at')
    .single();

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json(serializeProfile(profile));
});

export default users;
