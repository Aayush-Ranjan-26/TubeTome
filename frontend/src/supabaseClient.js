import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://bumwozrzbcuvqhohkwmd.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1bXdvenJ6YmN1dnFob2hrd21kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MDM3MjYsImV4cCI6MjA4ODk3OTcyNn0._Z3Y09YPEajcb1-a196Qo4zlBvJGLc6mYcPJS9exN14';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
    },
});
