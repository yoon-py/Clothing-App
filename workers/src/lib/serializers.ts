type Nullable<T> = T | null | undefined;

type ProfileRow = {
  id: string;
  nickname: string;
  avatar_url: Nullable<string>;
  location_name: Nullable<string>;
  rating: Nullable<number | string>;
  created_at: string;
};

type SellerRelationRow = {
  id: string;
  nickname: Nullable<string>;
  avatar_url: Nullable<string>;
  location_name?: Nullable<string>;
  rating: Nullable<number | string>;
};

type NearbyItemRow = {
  id: string;
  title: string;
  description?: Nullable<string>;
  price: number;
  category: string;
  size: Nullable<string>;
  brand: Nullable<string>;
  condition: string;
  status: string;
  images: Nullable<string[]>;
  location_name: Nullable<string>;
  lat?: Nullable<number | string>;
  lng?: Nullable<number | string>;
  views?: Nullable<number>;
  trade_place_name?: Nullable<string>;
  trade_place_lat?: Nullable<number | string>;
  trade_place_lng?: Nullable<number | string>;
  created_at: string;
  seller_id: string;
  seller_nickname?: Nullable<string>;
  seller_avatar_url?: Nullable<string>;
  seller_rating?: Nullable<number | string>;
  seller?: SellerRelationRow | SellerRelationRow[];
};

export type ProfileResponse = {
  id: string;
  nickname: string;
  avatarUrl: string | null;
  locationName: string | null;
  rating: number;
  createdAt: string;
};

export type ItemResponse = {
  id: string;
  title: string;
  description: string | null;
  price: number;
  category: string;
  size: string | null;
  brand: string | null;
  condition: string;
  status: string;
  images: string[];
  locationName: string | null;
  lat: number | null;
  lng: number | null;
  views: number;
  tradePlaceName: string | null;
  tradePlaceLat: number | null;
  tradePlaceLng: number | null;
  createdAt: string;
  sellerId: string;
  seller: {
    id: string;
    nickname: string;
    avatarUrl: string | null;
    locationName: string | null;
    rating: number;
  };
};

function toNumber(value: Nullable<number | string>, fallback = 0): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

export function serializeProfile(profile: ProfileRow): ProfileResponse {
  return {
    id: profile.id,
    nickname: profile.nickname,
    avatarUrl: profile.avatar_url ?? null,
    locationName: profile.location_name ?? null,
    rating: toNumber(profile.rating, 0),
    createdAt: profile.created_at,
  };
}

export function serializeItem(item: NearbyItemRow): ItemResponse {
  const relationSeller = Array.isArray(item.seller) ? item.seller[0] : item.seller;
  const seller = relationSeller ?? {
    id: item.seller_id,
    nickname: item.seller_nickname ?? '알 수 없음',
    avatar_url: item.seller_avatar_url ?? null,
    rating: item.seller_rating ?? 0,
    location_name: null,
  };
  const lat = toNumber(item.lat, Number.NaN);
  const lng = toNumber(item.lng, Number.NaN);

  return {
    id: item.id,
    title: item.title,
    description: item.description ?? null,
    price: item.price,
    category: item.category,
    size: item.size ?? null,
    brand: item.brand ?? null,
    condition: item.condition,
    status: item.status,
    images: item.images ?? [],
    locationName: item.location_name ?? null,
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
    views: item.views ?? 0,
    tradePlaceName: item.trade_place_name ?? null,
    tradePlaceLat: (() => { const v = toNumber(item.trade_place_lat, Number.NaN); return Number.isFinite(v) ? v : null; })(),
    tradePlaceLng: (() => { const v = toNumber(item.trade_place_lng, Number.NaN); return Number.isFinite(v) ? v : null; })(),
    createdAt: item.created_at,
    sellerId: item.seller_id,
    seller: {
      id: seller.id,
      nickname: seller.nickname ?? '알 수 없음',
      avatarUrl: seller.avatar_url ?? null,
      locationName: seller.location_name ?? null,
      rating: toNumber(seller.rating, 0),
    },
  };
}
