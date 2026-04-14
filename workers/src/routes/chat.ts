import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import { getSupabase } from '../lib/supabase';

const chat = new Hono<{
  Bindings: { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string };
  Variables: { userId: string; userPhone: string };
}>();

// 채팅방 생성 or 기존 방 반환
chat.post('/rooms', authMiddleware, async (c) => {
  const buyerId = c.get('userId');
  const { itemId } = await c.req.json<{ itemId: string }>();

  if (!itemId?.trim()) {
    return c.json({ error: 'itemId is required' }, 400);
  }

  const supabase = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: item, error: itemError } = await supabase
    .from('items')
    .select('id, seller_id, title, images')
    .eq('id', itemId)
    .single();

  if (itemError || !item) return c.json({ error: 'Item not found' }, 404);
  if (item.seller_id === buyerId) return c.json({ error: 'Cannot chat with yourself' }, 400);

  const { data: existing } = await supabase
    .from('rooms')
    .select('id')
    .eq('item_id', itemId)
    .eq('buyer_id', buyerId)
    .maybeSingle();

  if (existing) return c.json({ roomId: existing.id });

  const { data: room, error } = await supabase
    .from('rooms')
    .insert({ item_id: itemId, buyer_id: buyerId, seller_id: item.seller_id })
    .select('id')
    .single();

  if (error || !room) return c.json({ error: error?.message ?? 'Failed' }, 500);

  return c.json({ roomId: room.id }, 201);
});

// 내 채팅 목록
chat.get('/rooms', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const supabase = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: rooms, error } = await supabase
    .from('rooms')
    .select(`
      id,
      created_at,
      item:items!item_id(id, title, images),
      buyer:profiles!buyer_id(id, nickname, avatar_url),
      seller:profiles!seller_id(id, nickname, avatar_url),
      messages(id, content, created_at, sender_id)
    `)
    .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
    .order('created_at', { ascending: false })
    .order('created_at', { referencedTable: 'messages', ascending: false })
    .limit(1, { referencedTable: 'messages' });

  if (error) return c.json({ error: error.message }, 500);

  return c.json({ rooms: rooms ?? [] });
});

// 채팅방 상세 + 메시지 목록
chat.get('/rooms/:roomId', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const roomId = c.req.param('roomId');
  const supabase = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: room, error } = await supabase
    .from('rooms')
    .select(`
      id,
      created_at,
      buyer_id,
      seller_id,
      item:items!item_id(id, title, images),
      buyer:profiles!buyer_id(id, nickname, avatar_url),
      seller:profiles!seller_id(id, nickname, avatar_url),
      messages(id, content, created_at, sender_id)
    `)
    .eq('id', roomId)
    .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
    .order('created_at', { referencedTable: 'messages', ascending: true })
    .limit(200, { referencedTable: 'messages' })
    .maybeSingle();

  if (error) return c.json({ error: error.message }, 500);
  if (!room) return c.json({ error: 'Room not found' }, 404);

  return c.json({ room });
});

// 채팅 메시지 전송
chat.post('/rooms/:roomId/messages', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const roomId = c.req.param('roomId');
  const { content } = await c.req.json<{ content: string }>();

  const text = content?.trim();
  if (!text) {
    return c.json({ error: 'content is required' }, 400);
  }

  const supabase = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: room, error: roomError } = await supabase
    .from('rooms')
    .select('id, buyer_id, seller_id')
    .eq('id', roomId)
    .maybeSingle();

  if (roomError) return c.json({ error: roomError.message }, 500);
  if (!room) return c.json({ error: 'Room not found' }, 404);
  if (room.buyer_id !== userId && room.seller_id !== userId) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const { data: message, error: messageError } = await supabase
    .from('messages')
    .insert({
      room_id: roomId,
      sender_id: userId,
      content: text,
    })
    .select('id, room_id, sender_id, content, created_at')
    .single();

  if (messageError || !message) {
    return c.json({ error: messageError?.message ?? 'Failed to send message' }, 500);
  }

  return c.json({ message }, 201);
});

export default chat;
