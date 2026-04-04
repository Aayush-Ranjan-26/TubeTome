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
        storage: {
            // Use sessionStorage instead of localStorage — tokens don't persist across tabs/restarts.
            // This limits the XSS token theft window: stolen tokens expire with the tab.
            getItem: (key) => sessionStorage.getItem(key),
            setItem: (key, value) => sessionStorage.setItem(key, value),
            removeItem: (key) => sessionStorage.removeItem(key),
        },
    },
});
