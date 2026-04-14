import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import { getSupabase } from '../lib/supabase';

const likes = new Hono<{
  Bindings: { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string };
  Variables: { userId: string };
}>();

function isLikesTableMissing(message?: string): boolean {
  const normalized = (message || '').toLowerCase();
  return (
    (normalized.includes('schema cache') &&
      (normalized.includes('public.likes') || normalized.includes('public likes'))) ||
    normalized.includes('relation "likes" does not exist') ||
    normalized.includes("relation 'likes' does not exist") ||
    normalized.includes('table "likes" does not exist') ||
    normalized.includes('42p01')
  );
}

function likesDbErrorResponse(c: any, message?: string) {
  if (isLikesTableMissing(message)) {
    return c.json(
      {
        error:
          '좋아요 DB 설정이 아직 안 됐어요. Supabase SQL Editor에서 workers/supabase/migration.sql을 실행해주세요.',
      },
      500
    );
  }

  return c.json({ error: message || '좋아요 처리에 실패했어요.' }, 500);
}

// 찜 토글
likes.post('/:itemId', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const itemId = c.req.param('itemId');
  const supabase = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: existing, error: existingError } = await supabase
    .from('likes')
    .select('id')
    .eq('user_id', userId)
    .eq('item_id', itemId)
    .maybeSingle();

  if (existingError) {
    return likesDbErrorResponse(c, existingError.message);
  }

  if (existing) {
    const { error: deleteError } = await supabase
      .from('likes')
      .delete()
      .eq('id', existing.id);
    if (deleteError) {
      return likesDbErrorResponse(c, deleteError.message);
    }
    return c.json({ liked: false });
  }

  const { error: insertError } = await supabase
    .from('likes')
    .insert({ user_id: userId, item_id: itemId });
  if (insertError) {
    return likesDbErrorResponse(c, insertError.message);
  }

  return c.json({ liked: true });
});

// 내 찜 목록
likes.get('/me', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const supabase = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data, error } = await supabase
    .from('likes')
    .select('item_id, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) return likesDbErrorResponse(c, error.message);

  return c.json({ likedItemIds: (data ?? []).map((r) => r.item_id) });
});

// 특정 아이템 좋아요 수
likes.get('/:itemId/count', async (c) => {
  const itemId = c.req.param('itemId');
  const supabase = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);

  const { count, error } = await supabase
    .from('likes')
    .select('id', { count: 'exact', head: true })
    .eq('item_id', itemId);

  if (error) {
    return likesDbErrorResponse(c, error.message);
  }

  return c.json({ count: count ?? 0 });
});

// 특정 아이템 찜 여부
likes.get('/:itemId/status', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const itemId = c.req.param('itemId');
  const supabase = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data, error } = await supabase
    .from('likes')
    .select('id')
    .eq('user_id', userId)
    .eq('item_id', itemId)
    .maybeSingle();

  if (error) {
    return likesDbErrorResponse(c, error.message);
  }

  return c.json({ liked: !!data });
});

export default likes;
