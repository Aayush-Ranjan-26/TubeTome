import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error(
        '⚠ Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in your .env file.\n' +
        '  Copy frontend/.env.example → frontend/.env and fill in your values.'
    );
}

export const supabase = createClient(SUPABASE_URL || '', SUPABASE_ANON_KEY || '', {
    auth: {
        flowType: 'pkce',           // SECURITY: PKCE prevents authorization code interception
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        // localStorage persists the PKCE code verifier through the OAuth redirect.
        // sessionStorage was losing the verifier during navigation, forcing two sign-ins.
    },
});
