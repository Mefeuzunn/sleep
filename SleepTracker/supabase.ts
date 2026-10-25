import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';

// Supabase Proje Bilgileri
export const SUPABASE_URL = 'https://qzxokzxkpslldrgzpwns.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_YcQEs-VBSM-_rCZkv2PxEw_QQJH-lii';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});
