import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import { getSupabase } from '../lib/supabase';

const posts = new Hono<{
  Bindings: { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string };
  Variables: { userId: string };
}>();

function isPostFeatureTableMissing(message?: string): boolean {
  const normalized = (message || '').toLowerCase();
  return (
    normalized.includes('42p01') ||
    normalized.includes('public.post_likes') ||
    normalized.includes('public post_likes') ||
    normalized.includes('public.post_comments') ||
    normalized.includes('public post_comments') ||
    normalized.includes('public.post_chat_rooms') ||
    normalized.includes('public post_chat_rooms') ||
    normalized.includes('public.post_chat_messages') ||
    normalized.includes('public post_chat_messages') ||
    normalized.includes('relation "post_likes" does not exist') ||
    normalized.includes("relation 'post_likes' does not exist") ||
    normalized.includes('relation "post_comments" does not exist') ||
    normalized.includes("relation 'post_comments' does not exist") ||
    normalized.includes('relation "post_chat_rooms" does not exist') ||
    normalized.includes("relation 'post_chat_rooms' does not exist") ||
    normalized.includes('relation "post_chat_messages" does not exist') ||
    normalized.includes("relation 'post_chat_messages' does not exist")
  );
}

function postFeatureDbErrorResponse(c: any, message?: string) {
  if (isPostFeatureTableMissing(message)) {
    return c.json(
      {
        error:
          '커뮤니티 DB 설정이 아직 안 됐어요. Supabase SQL Editor에서 workers/supabase/migration.sql을 실행해주세요.',
      },
      500
    );
  }

  return c.json({ error: message || '커뮤니티 처리에 실패했어요.' }, 500);
}

// 코디 피드 목록
posts.get('/', async (c) => {
  const cursor = parseInt(c.req.query('cursor') || '0', 10);
  const supabase = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data, error } = await supabase
    .from('posts')
    .select('id, author_id, title, content, images, tags, likes_count, created_at')
    .order('created_at', { ascending: false })
    .range(cursor, cursor + 19);

  if (error) return c.json({ error: error.message }, 500);

  // 작성자 프로필 별도 조회
  const authorIds = [...new Set((data ?? []).map((p) => p.author_id))];
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, nickname, avatar_url, location_name')
    .in('id', authorIds.length > 0 ? authorIds : ['00000000-0000-0000-0000-000000000000']);

  const profileMap = Object.fromEntries((profiles ?? []).map((p) => [p.id, p]));

  const result = (data ?? []).map((post) => ({
    id: post.id,
    title: post.title,
    content: post.content,
    images: post.images ?? [],
    tags: post.tags ?? [],
    likesCount: post.likes_count ?? 0,
    createdAt: post.created_at,
    author: profileMap[post.author_id]
      ? {
          id: post.author_id,
          nickname: profileMap[post.author_id].nickname,
          avatarUrl: profileMap[post.author_id].avatar_url,
          locationName: profileMap[post.author_id].location_name,
        }
      : { id: post.author_id, nickname: '알 수 없음', avatarUrl: null, locationName: null },
  }));

  return c.json({ posts: result, nextCursor: result.length === 20 ? cursor + 20 : null });
});

// 내 게시글 좋아요 목록
posts.get('/likes/me', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const supabase = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data, error } = await supabase
    .from('post_likes')
    .select('post_id, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) return postFeatureDbErrorResponse(c, error.message);

  return c.json({ likedPostIds: (data ?? []).map((r) => r.post_id) });
});

// 게시글 채팅방 생성 or 기존 방 반환
posts.post('/:postId/chat-room', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const postId = c.req.param('postId');
  const supabase = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: post, error: postError } = await supabase
    .from('posts')
    .select('id, author_id')
    .eq('id', postId)
    .maybeSingle();

  if (postError) return c.json({ error: postError.message }, 500);
  if (!post) return c.json({ error: 'Post not found' }, 404);
  if (post.author_id === userId) {
    return c.json({ error: 'Cannot chat with yourself' }, 400);
  }

  const { data: existing, error: existingError } = await supabase
    .from('post_chat_rooms')
    .select('id')
    .eq('post_id', postId)
    .eq('initiator_id', userId)
    .eq('owner_id', post.author_id)
    .maybeSingle();

  if (existingError) return postFeatureDbErrorResponse(c, existingError.message);
  if (existing) return c.json({ roomId: existing.id });

  const { data: room, error: roomError } = await supabase
    .from('post_chat_rooms')
    .insert({
      post_id: postId,
      initiator_id: userId,
      owner_id: post.author_id,
    })
    .select('id')
    .single();

  if (roomError || !room) {
    return postFeatureDbErrorResponse(c, roomError?.message);
  }

  return c.json({ roomId: room.id }, 201);
});

// 내 게시글 채팅방 목록
posts.get('/chat/rooms', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const supabase = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: rooms, error } = await supabase
    .from('post_chat_rooms')
    .select(`
      id,
      created_at,
      post:posts!post_id(id, title, images),
      initiator:profiles!initiator_id(id, nickname, avatar_url),
      owner:profiles!owner_id(id, nickname, avatar_url),
      messages:post_chat_messages(id, content, created_at, sender_id)
    `)
    .or(`initiator_id.eq.${userId},owner_id.eq.${userId}`)
    .order('created_at', { ascending: false })
    .order('created_at', { referencedTable: 'messages', ascending: false })
    .limit(1, { referencedTable: 'messages' });

  if (error) return postFeatureDbErrorResponse(c, error.message);

  return c.json({ rooms: rooms ?? [] });
});

// 게시글 채팅방 상세 + 메시지 목록
posts.get('/chat/rooms/:roomId', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const roomId = c.req.param('roomId');
  const supabase = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: room, error } = await supabase
    .from('post_chat_rooms')
    .select(`
      id,
      created_at,
      initiator_id,
      owner_id,
      post:posts!post_id(id, title, images),
      initiator:profiles!initiator_id(id, nickname, avatar_url),
      owner:profiles!owner_id(id, nickname, avatar_url),
      messages:post_chat_messages(id, content, created_at, sender_id)
    `)
    .eq('id', roomId)
    .or(`initiator_id.eq.${userId},owner_id.eq.${userId}`)
    .order('created_at', { referencedTable: 'messages', ascending: true })
    .limit(300, { referencedTable: 'messages' })
    .maybeSingle();

  if (error) return postFeatureDbErrorResponse(c, error.message);
  if (!room) return c.json({ error: 'Room not found' }, 404);

  return c.json({ room });
});

// 게시글 채팅 메시지 전송
posts.post('/chat/rooms/:roomId/messages', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const roomId = c.req.param('roomId');
  const body = await c.req.json<{ content: string }>();
  const text = body.content?.trim();

  if (!text) {
    return c.json({ error: 'content is required' }, 400);
  }

  const supabase = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: room, error: roomError } = await supabase
    .from('post_chat_rooms')
    .select('id, initiator_id, owner_id')
    .eq('id', roomId)
    .maybeSingle();

  if (roomError) return postFeatureDbErrorResponse(c, roomError.message);
  if (!room) return c.json({ error: 'Room not found' }, 404);
  if (room.initiator_id !== userId && room.owner_id !== userId) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const { data: message, error: messageError } = await supabase
    .from('post_chat_messages')
    .insert({
      room_id: roomId,
      sender_id: userId,
      content: text,
    })
    .select('id, room_id, sender_id, content, created_at')
    .single();

  if (messageError || !message) {
    return postFeatureDbErrorResponse(c, messageError?.message);
  }

  return c.json({ message }, 201);
});

// 코디 게시물 작성
posts.post('/', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json<{ title: string; content?: string; images: string[]; tags?: string[] }>();

  if (!body.title?.trim() || !body.images?.length) {
    return c.json({ error: 'title and at least one image are required' }, 400);
  }

  const supabase = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data, error } = await supabase
    .from('posts')
    .insert({
      author_id: userId,
      title: body.title.trim(),
      content: body.content?.trim() || null,
      images: body.images,
      tags: body.tags ?? [],
    })
    .select('id, author_id, title, content, images, tags, likes_count, created_at')
    .single();

  if (error || !data) return c.json({ error: error?.message ?? 'Failed' }, 500);

  return c.json({ id: data.id, title: data.title, images: data.images, createdAt: data.created_at }, 201);
});

// 게시글 좋아요 토글
posts.post('/:postId/likes', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const postId = c.req.param('postId');
  const supabase = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: existing, error: existingError } = await supabase
    .from('post_likes')
    .select('id')
    .eq('user_id', userId)
    .eq('post_id', postId)
    .maybeSingle();

  if (existingError) {
    return postFeatureDbErrorResponse(c, existingError.message);
  }

  let liked = false;
  if (existing) {
    const { error: deleteError } = await supabase
      .from('post_likes')
      .delete()
      .eq('id', existing.id);
    if (deleteError) {
      return postFeatureDbErrorResponse(c, deleteError.message);
    }
    liked = false;
  } else {
    const { error: insertError } = await supabase
      .from('post_likes')
      .insert({ user_id: userId, post_id: postId });
    if (insertError) {
      return postFeatureDbErrorResponse(c, insertError.message);
    }
    liked = true;
  }

  const { data: post, error: postError } = await supabase
    .from('posts')
    .select('id, likes_count')
    .eq('id', postId)
    .maybeSingle();

  if (postError) {
    return postFeatureDbErrorResponse(c, postError.message);
  }
  if (!post) {
    return c.json({ error: 'Post not found' }, 404);
  }

  return c.json({ liked, likesCount: post.likes_count ?? 0 });
});

// 게시글 좋아요 상태
posts.get('/:postId/likes/status', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const postId = c.req.param('postId');
  const supabase = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data, error } = await supabase
    .from('post_likes')
    .select('id')
    .eq('user_id', userId)
    .eq('post_id', postId)
    .maybeSingle();

  if (error) return postFeatureDbErrorResponse(c, error.message);

  return c.json({ liked: !!data });
});

// 게시글 댓글 목록
posts.get('/:postId/comments', async (c) => {
  const postId = c.req.param('postId');
  const supabase = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: comments, error } = await supabase
    .from('post_comments')
    .select(`
      id,
      post_id,
      author_id,
      content,
      created_at,
      author:profiles!author_id(id, nickname, avatar_url)
    `)
    .eq('post_id', postId)
    .order('created_at', { ascending: true })
    .limit(300);

  if (error) return postFeatureDbErrorResponse(c, error.message);

  const result = (comments ?? []).map((comment: any) => {
    const author = Array.isArray(comment.author) ? comment.author[0] : comment.author;
    return {
      id: comment.id,
      postId: comment.post_id,
      authorId: comment.author_id,
      content: comment.content ?? '',
      createdAt: comment.created_at,
      author: {
        id: author?.id ?? comment.author_id,
        nickname: author?.nickname ?? '익명',
        avatarUrl: author?.avatar_url ?? null,
      },
    };
  });

  return c.json({ comments: result });
});

// 게시글 댓글 작성
posts.post('/:postId/comments', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const postId = c.req.param('postId');
  const body = await c.req.json<{ content: string }>();
  const content = body.content?.trim();

  if (!content) {
    return c.json({ error: 'content is required' }, 400);
  }
  if (content.length > 500) {
    return c.json({ error: 'content is too long (max 500)' }, 400);
  }

  const supabase = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: post, error: postError } = await supabase
    .from('posts')
    .select('id')
    .eq('id', postId)
    .maybeSingle();
  if (postError) return c.json({ error: postError.message }, 500);
  if (!post) return c.json({ error: 'Post not found' }, 404);

  const { data: inserted, error: insertError } = await supabase
    .from('post_comments')
    .insert({
      post_id: postId,
      author_id: userId,
      content,
    })
    .select('id, post_id, author_id, content, created_at')
    .single();

  if (insertError || !inserted) {
    return postFeatureDbErrorResponse(c, insertError?.message);
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, nickname, avatar_url')
    .eq('id', userId)
    .maybeSingle();

  return c.json(
    {
      comment: {
        id: inserted.id,
        postId: inserted.post_id,
        authorId: inserted.author_id,
        content: inserted.content ?? '',
        createdAt: inserted.created_at,
        author: {
          id: profile?.id ?? userId,
          nickname: profile?.nickname ?? '익명',
          avatarUrl: profile?.avatar_url ?? null,
        },
      },
    },
    201
  );
});

export default posts;
