import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import { getSupabase } from '../lib/supabase';
import { serializeItem } from '../lib/serializers';

const items = new Hono<{
  Bindings: { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string };
  Variables: { userId: string; userPhone: string };
}>();

const ALLOWED_CATEGORIES = new Set([
  '상의',
  '원피스',
  '아우터',
  '팬츠',
  '스커트',
  '언더웨어',
  '신발',
  '가방',
  '기타',
]);

const ITEM_SELECT_FIELDS =
  'id, seller_id, title, description, category, size, brand, price, condition, status, images, location_name, lat, lng, views, created_at, trade_place_name, trade_place_lat, trade_place_lng';
const SELLER_SELECT_FIELDS = 'id, nickname, avatar_url, rating, location_name';

items.get('/', async (c) => {
  const latRaw = c.req.query('lat');
  const lngRaw = c.req.query('lng');
  const radius = parseFloat(c.req.query('radius') || '3000');
  const cursor = parseInt(c.req.query('cursor') || '0', 10);
  const category = c.req.query('category') || null;
  const hasCoordinates = !!latRaw && !!lngRaw;

  if (hasCoordinates && (isNaN(radius) || radius <= 0 || radius > 50000)) {
    return c.json({ error: 'radius must be between 1 and 50000 meters' }, 400);
  }

  if (!Number.isInteger(cursor) || cursor < 0) {
    return c.json({ error: 'cursor must be a non-negative integer' }, 400);
  }

  const supabase = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!hasCoordinates) {
    let query = supabase
      .from('items')
      .select(ITEM_SELECT_FIELDS)
      .eq('status', 'selling')
      .order('created_at', { ascending: false })
      .range(cursor, cursor + 19);

    if (category) {
      query = query.eq('category', category);
    }

    const { data: latestItems, error: latestItemsError } = await query;
    if (latestItemsError) {
      return c.json({ error: latestItemsError.message }, 500);
    }

    const items = latestItems ?? [];
    const sellerIds = [...new Set(items.map((item) => item.seller_id))];
    const sellerMap = new Map<string, any>();

    if (sellerIds.length > 0) {
      const { data: sellers, error: sellersError } = await supabase
        .from('profiles')
        .select(SELLER_SELECT_FIELDS)
        .in('id', sellerIds);

      if (sellersError) {
        return c.json({ error: sellersError.message }, 500);
      }

      (sellers ?? []).forEach((seller) => {
        sellerMap.set(seller.id, seller);
      });
    }

    const result = items.map((item) =>
      serializeItem(sellerMap.has(item.seller_id) ? { ...item, seller: sellerMap.get(item.seller_id) } : item)
    );

    return c.json({
      items: result,
      nextCursor: result.length === 20 ? cursor + 20 : null,
    });
  }

  const lat = parseFloat(latRaw || '');
  const lng = parseFloat(lngRaw || '');

  if (isNaN(lat) || isNaN(lng)) {
    return c.json({ error: 'lat and lng must be valid numbers' }, 400);
  }

  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return c.json({ error: 'Invalid coordinate range' }, 400);
  }

  const { data, error } = await supabase.rpc('get_nearby_items', {
    q_lat: lat,
    q_lng: lng,
    radius_meters: radius,
    cursor_offset: cursor,
    category_filter: category,
  });

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  const result = (data ?? []).map(serializeItem);
  return c.json({
    items: result,
    nextCursor: result.length === 20 ? cursor + 20 : null,
  });
});

items.get('/me/sales', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const status = c.req.query('status');
  const supabase = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);

  let query = supabase
    .from('items')
    .select(ITEM_SELECT_FIELDS)
    .eq('seller_id', userId)
    .order('created_at', { ascending: false });

  if (status && ['selling', 'reserved', 'sold'].includes(status)) {
    query = query.eq('status', status);
  }

  const { data: saleItems, error: saleItemsError } = await query;
  if (saleItemsError) {
    return c.json({ error: saleItemsError.message }, 500);
  }

  const { data: seller } = await supabase
    .from('profiles')
    .select(SELLER_SELECT_FIELDS)
    .eq('id', userId)
    .single();

  const result = (saleItems ?? []).map((item) =>
    serializeItem(seller ? { ...item, seller } : item)
  );

  return c.json({ items: result });
});

items.get('/me/purchases', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const supabase = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: rooms, error: roomsError } = await supabase
    .from('rooms')
    .select('item_id, created_at')
    .eq('buyer_id', userId)
    .order('created_at', { ascending: false });

  if (roomsError) {
    return c.json({ error: roomsError.message }, 500);
  }

  const seenItemIds = new Set<string>();
  const orderedItemIds: string[] = [];

  for (const room of rooms ?? []) {
    const itemId = room.item_id as string | null;
    if (!itemId || seenItemIds.has(itemId)) continue;
    seenItemIds.add(itemId);
    orderedItemIds.push(itemId);
  }

  if (orderedItemIds.length === 0) {
    return c.json({ items: [] });
  }

  const { data: itemRows, error: itemsError } = await supabase
    .from('items')
    .select(ITEM_SELECT_FIELDS)
    .in('id', orderedItemIds);

  if (itemsError) {
    return c.json({ error: itemsError.message }, 500);
  }

  const items = itemRows ?? [];
  const sellerIds = [...new Set(items.map((item) => item.seller_id))];
  const sellerMap = new Map<string, any>();

  if (sellerIds.length > 0) {
    const { data: sellers, error: sellersError } = await supabase
      .from('profiles')
      .select(SELLER_SELECT_FIELDS)
      .in('id', sellerIds);

    if (sellersError) {
      return c.json({ error: sellersError.message }, 500);
    }

    (sellers ?? []).forEach((seller) => {
      sellerMap.set(seller.id, seller);
    });
  }

  const itemMap = new Map(items.map((item) => [item.id, item]));
  const orderedItems = orderedItemIds
    .map((itemId) => itemMap.get(itemId))
    .filter((item): item is NonNullable<typeof item> => !!item);

  const result = orderedItems.map((item) =>
    serializeItem(
      sellerMap.has(item.seller_id)
        ? { ...item, seller: sellerMap.get(item.seller_id) }
        : item
    )
  );

  return c.json({ items: result });
});

items.get('/:id', async (c) => {
  const id = c.req.param('id');
  const supabase = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: item, error } = await supabase
    .from('items')
    .select(ITEM_SELECT_FIELDS)
    .eq('id', id)
    .single();

  if (error || !item) return c.json({ error: 'Item not found' }, 404);

  const { data: seller } = await supabase
    .from('profiles')
    .select(SELLER_SELECT_FIELDS)
    .eq('id', item.seller_id)
    .single();

  await supabase.rpc('increment_item_views', { item_id: id });

  return c.json(serializeItem(seller ? { ...item, seller } : item));
});

items.post('/', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json<{
    title: string;
    description?: string;
    category: string;
    size?: string;
    brand?: string;
    price: number;
    condition: string;
    images: string[];
    locationName?: string;
    lat?: number;
    lng?: number;
    tradePlaceName?: string;
    tradePlaceLat?: number;
    tradePlaceLng?: number;
  }>();

  const hasValidPrice = Number.isFinite(body.price) && body.price >= 0;
  if (!body.title?.trim() || !body.category?.trim() || !hasValidPrice || !body.images?.length) {
    return c.json({ error: 'Missing required fields' }, 400);
  }
  if (!ALLOWED_CATEGORIES.has(body.category.trim())) {
    return c.json({ error: 'Invalid category value' }, 400);
  }

  if (body.lat !== undefined && (body.lat < -90 || body.lat > 90)) {
    return c.json({ error: 'Invalid latitude value' }, 400);
  }

  if (body.lng !== undefined && (body.lng < -180 || body.lng > 180)) {
    return c.json({ error: 'Invalid longitude value' }, 400);
  }

  if (body.tradePlaceLat !== undefined || body.tradePlaceLng !== undefined) {
    if (typeof body.tradePlaceLat !== 'number' || typeof body.tradePlaceLng !== 'number') {
      return c.json({ error: 'tradePlaceLat and tradePlaceLng should be provided together' }, 400);
    }
    if (
      body.tradePlaceLat < -90 ||
      body.tradePlaceLat > 90 ||
      body.tradePlaceLng < -180 ||
      body.tradePlaceLng > 180
    ) {
      return c.json({ error: 'Invalid trade place coordinate range' }, 400);
    }
  }

  const hasCoordinates = typeof body.lat === 'number' && typeof body.lng === 'number';
  if (!hasCoordinates) {
    return c.json({ error: 'Location is required. Please verify your neighborhood first.' }, 400);
  }

  const supabase = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);

  const insertData: Record<string, any> = {
    seller_id: userId,
    title: body.title.trim(),
    description: body.description?.trim() || null,
    category: body.category.trim(),
    size: body.size?.trim() || null,
    brand: body.brand?.trim() || null,
    price: body.price,
    condition: body.condition || null,
    images: body.images,
    location_name: body.locationName?.trim() || null,
    trade_place_name: body.tradePlaceName?.trim() || null,
    trade_place_lat: typeof body.tradePlaceLat === 'number' ? body.tradePlaceLat : null,
    trade_place_lng: typeof body.tradePlaceLng === 'number' ? body.tradePlaceLng : null,
  };

  if (typeof body.lat === 'number' && typeof body.lng === 'number') {
    insertData.location = `SRID=4326;POINT(${body.lng} ${body.lat})`;
    insertData.lat = body.lat;
    insertData.lng = body.lng;
  }

  const { data: item, error } = await supabase
    .from('items')
    .insert(insertData)
    .select(ITEM_SELECT_FIELDS)
    .single();

  if (error) return c.json({ error: error.message }, 500);

  const { data: seller } = await supabase
    .from('profiles')
    .select(SELLER_SELECT_FIELDS)
    .eq('id', userId)
    .single();

  return c.json(serializeItem(seller ? { ...item, seller } : item), 201);
});

items.patch('/:id', authMiddleware, async (c) => {
  const id = c.req.param('id');
  const userId = c.get('userId');
  const body = await c.req.json<{
    title?: string;
    description?: string | null;
    category?: string;
    size?: string | null;
    brand?: string | null;
    price?: number;
    condition?: string;
    status?: 'selling' | 'reserved' | 'sold';
    images?: string[];
    locationName?: string | null;
    lat?: number;
    lng?: number;
    tradePlaceName?: string | null;
    tradePlaceLat?: number | null;
    tradePlaceLng?: number | null;
  }>();

  const supabase = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: existingItem, error: existingItemError } = await supabase
    .from('items')
    .select('id, seller_id')
    .eq('id', id)
    .single();

  if (existingItemError || !existingItem) {
    return c.json({ error: 'Item not found' }, 404);
  }

  if (existingItem.seller_id !== userId) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const updateData: Record<string, any> = {};

  if (body.title !== undefined) {
    const title = body.title.trim();
    if (!title) return c.json({ error: 'title is required' }, 400);
    updateData.title = title;
  }

  if (body.description !== undefined) {
    updateData.description = body.description?.trim() || null;
  }

  if (body.category !== undefined) {
    const category = body.category.trim();
    if (!category) return c.json({ error: 'category is required' }, 400);
    if (!ALLOWED_CATEGORIES.has(category)) {
      return c.json({ error: 'Invalid category value' }, 400);
    }
    updateData.category = category;
  }

  if (body.size !== undefined) {
    updateData.size = body.size?.trim() || null;
  }

  if (body.brand !== undefined) {
    updateData.brand = body.brand?.trim() || null;
  }

  if (body.price !== undefined) {
    if (!Number.isFinite(body.price) || body.price < 0) {
      return c.json({ error: 'Invalid price value' }, 400);
    }
    updateData.price = body.price;
  }

  if (body.condition !== undefined) {
    const condition = body.condition.trim();
    if (!condition) return c.json({ error: 'condition is required' }, 400);
    updateData.condition = condition;
  }

  if (body.status !== undefined) {
    if (!['selling', 'reserved', 'sold'].includes(body.status)) {
      return c.json({ error: 'Invalid status value' }, 400);
    }
    updateData.status = body.status;
  }

  if (body.images !== undefined) {
    if (!Array.isArray(body.images) || body.images.length === 0) {
      return c.json({ error: 'images must contain at least one image' }, 400);
    }
    updateData.images = body.images;
  }

  if (body.locationName !== undefined) {
    updateData.location_name = body.locationName?.trim() || null;
  }

  if (body.lat !== undefined || body.lng !== undefined) {
    if (typeof body.lat !== 'number' || typeof body.lng !== 'number') {
      return c.json({ error: 'lat and lng should be provided together' }, 400);
    }
    if (body.lat < -90 || body.lat > 90 || body.lng < -180 || body.lng > 180) {
      return c.json({ error: 'Invalid coordinate range' }, 400);
    }
    updateData.location = `SRID=4326;POINT(${body.lng} ${body.lat})`;
    updateData.lat = body.lat;
    updateData.lng = body.lng;
  }

  if (body.tradePlaceName !== undefined) {
    updateData.trade_place_name = body.tradePlaceName?.trim() || null;
  }

  if (body.tradePlaceLat !== undefined || body.tradePlaceLng !== undefined) {
    if (body.tradePlaceLat === undefined || body.tradePlaceLng === undefined) {
      return c.json({ error: 'tradePlaceLat and tradePlaceLng should be provided together' }, 400);
    }
    const validLat = body.tradePlaceLat === null || typeof body.tradePlaceLat === 'number';
    const validLng = body.tradePlaceLng === null || typeof body.tradePlaceLng === 'number';
    if (!validLat || !validLng) {
      return c.json({ error: 'tradePlaceLat and tradePlaceLng should be numbers or null' }, 400);
    }
    if (
      typeof body.tradePlaceLat === 'number' &&
      (body.tradePlaceLat < -90 || body.tradePlaceLat > 90)
    ) {
      return c.json({ error: 'Invalid trade place latitude value' }, 400);
    }
    if (
      typeof body.tradePlaceLng === 'number' &&
      (body.tradePlaceLng < -180 || body.tradePlaceLng > 180)
    ) {
      return c.json({ error: 'Invalid trade place longitude value' }, 400);
    }
    updateData.trade_place_lat = body.tradePlaceLat;
    updateData.trade_place_lng = body.tradePlaceLng;
  }

  if (Object.keys(updateData).length === 0) {
    return c.json({ error: 'Nothing to update' }, 400);
  }

  const { data: item, error: updateError } = await supabase
    .from('items')
    .update(updateData)
    .eq('id', id)
    .eq('seller_id', userId)
    .select(ITEM_SELECT_FIELDS)
    .single();

  if (updateError || !item) {
    return c.json({ error: updateError?.message || 'Failed to update item' }, 500);
  }

  const { data: seller } = await supabase
    .from('profiles')
    .select(SELLER_SELECT_FIELDS)
    .eq('id', userId)
    .single();

  return c.json(serializeItem(seller ? { ...item, seller } : item));
});

items.delete('/:id', authMiddleware, async (c) => {
  const id = c.req.param('id');
  const userId = c.get('userId');
  const supabase = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: existingItem, error: existingItemError } = await supabase
    .from('items')
    .select('id, seller_id')
    .eq('id', id)
    .single();

  if (existingItemError || !existingItem) {
    return c.json({ error: 'Item not found' }, 404);
  }

  if (existingItem.seller_id !== userId) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const { error: deleteError } = await supabase
    .from('items')
    .delete()
    .eq('id', id)
    .eq('seller_id', userId);

  if (deleteError) {
    return c.json({ error: deleteError.message }, 500);
  }

  return c.json({ success: true });
});

export default items;
