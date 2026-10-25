import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Supabase Proje Bilgileri
export const SUPABASE_URL = 'https://qzxokzxkpslldrgzpwns.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_YcQEs-VBSM-_rCZkv2PxEw_QQJH-lii';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
