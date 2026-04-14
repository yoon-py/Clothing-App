import { Hono } from 'hono';
import { getSupabase } from '../lib/supabase';
import { serializeProfile } from '../lib/serializers';

const auth = new Hono<{
  Bindings: {
    SUPABASE_URL: string;
    SUPABASE_SERVICE_ROLE_KEY: string;
    ENVIRONMENT: string;
  };
}>();

async function getProfileById(
  supabase: ReturnType<typeof getSupabase>,
  userId: string
) {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, nickname, avatar_url, location_name, rating, created_at')
    .eq('id', userId)
    .single();

  if (error || !profile) {
    return { profile: null, error: 'Failed to fetch user profile' as const };
  }

  return { profile, error: null };
}

// 한국 번호/국제 번호 입력값을 E.164로 정규화
function normalizePhone(phone: string): string | null {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/-/g, '');

  // +821012345678 또는 821012345678 형태 허용
  if (/^\+?[1-9][0-9]{7,14}$/.test(digits)) {
    return digits.startsWith('+') ? digits : `+${digits}`;
  }

  // 01012345678 형태 한국 번호 허용
  if (/^01[0-9]{8,9}$/.test(digits)) {
    return `+82${digits.slice(1)}`;
  }

  return null;
}

auth.post('/request-otp', async (c) => {
  const { phone } = await c.req.json<{ phone: string }>();
  const normalizedPhone = normalizePhone(phone || '');

  if (!normalizedPhone) {
    return c.json({ error: 'Invalid phone number' }, 400);
  }

  const supabase = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);
  const { error } = await supabase.auth.signInWithOtp({ phone: normalizedPhone });

  if (error) {
    return c.json({ error: error.message }, 400);
  }

  return c.json({ message: 'OTP sent' });
});

auth.post('/verify', async (c) => {
  const { phone, code } = await c.req.json<{ phone: string; code: string }>();
  const normalizedPhone = normalizePhone(phone || '');

  if (!normalizedPhone || !/^[0-9]{4,8}$/.test((code || '').trim())) {
    return c.json({ error: 'Invalid verification payload' }, 400);
  }

  const supabase = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await supabase.auth.verifyOtp({
    phone: normalizedPhone,
    token: code.trim(),
    type: 'sms',
  });

  if (error || !data.user || !data.session) {
    return c.json({ error: error?.message ?? 'Verification failed' }, 400);
  }

  const profileResult = await getProfileById(supabase, data.user.id);
  if (profileResult.error || !profileResult.profile) {
    return c.json({ error: profileResult.error }, 500);
  }

  return c.json({
    token: data.session.access_token,
    refreshToken: data.session.refresh_token,
    user: serializeProfile(profileResult.profile),
    isNewUser:
      !profileResult.profile.nickname ||
      profileResult.profile.nickname.startsWith('user_'),
  });
});

auth.post('/refresh', async (c) => {
  const { refreshToken } = await c.req.json<{ refreshToken?: string }>();

  if (!refreshToken || typeof refreshToken !== 'string') {
    return c.json({ error: 'refreshToken is required' }, 400);
  }

  const supabase = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await supabase.auth.refreshSession({
    refresh_token: refreshToken,
  });

  if (error || !data.session || !data.user) {
    return c.json({ error: error?.message ?? 'Refresh failed' }, 401);
  }

  const profileResult = await getProfileById(supabase, data.user.id);
  if (profileResult.error || !profileResult.profile) {
    return c.json({ error: profileResult.error }, 500);
  }

  return c.json({
    token: data.session.access_token,
    refreshToken: data.session.refresh_token,
    user: serializeProfile(profileResult.profile),
  });
});

export default auth;
