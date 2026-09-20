import { useState, useEffect, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from './supabaseClient';

/**
 * Lightweight auth hook for Supabase Google OAuth.
 *
 * Returns:
 *   user      — current user object (or null)
 *   session   — current session (or null)
 *   loading   — true while checking session
 *   profile   — user profile from profiles table
 *   signIn    — function to sign in with Google
 *   signOut   — function to sign out
 */
export function useAuth() {
    const [user, setUser] = useState(null);
    const [session, setSession] = useState(null);
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);

    // Fetch profile from Supabase
    const fetchProfile = useCallback(async (userId) => {
        if (!userId) { setProfile(null); return; }
        try {
            const { data } = await supabase
                .from('profiles')
                .select('id, name, avatar_url')
                .eq('auth_user_id', userId)
                .maybeSingle();
            setProfile(data);
        } catch { setProfile(null); }
    }, []);

    // Listen for auth state changes (login, logout, token refresh)
    useEffect(() => {
        // Check current session on mount
        supabase.auth.getSession().then(({ data: { session: s } }) => {
            setSession(s);
            setUser(s?.user ?? null);
            if (s?.user) fetchProfile(s.user.id);
            setLoading(false);
        });

        // Subscribe to changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            (_event, s) => {
                setSession(s);
                setUser(s?.user ?? null);
                if (s?.user) fetchProfile(s.user.id);
                else setProfile(null);
            }
        );

        return () => subscription.unsubscribe();
    }, [fetchProfile]);

    // Sign in with Google OAuth
    const signIn = useCallback(async () => {
        if (!isSupabaseConfigured) throw new Error('Sign-in is not configured: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing from this build.');
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: import.meta.env.VITE_SITE_URL || `${window.location.origin}/`,
                queryParams: {
                    prompt: 'select_account',
                },
            },
        });
        if (error) throw error;
    }, []);

    // Sign out
    const signOut = useCallback(async () => {
        await supabase.auth.signOut();
        setUser(null);
        setSession(null);
        setProfile(null);
    }, []);

    return { user, session, profile, loading, signIn, signOut };
}

/**
 * Log an import to the import_history table.
 */
export async function logImportHistory(userId, playlistUrl, playlistTitle, videoCount, notebookUrl) {
    if (!userId) return;
    try {
        const { error } = await supabase.from('import_history').insert({
            user_id: userId,
            auth_user_id: userId, // RLS policies check this column
            playlist_url: playlistUrl,
            playlist_title: playlistTitle,
            video_count: videoCount,
            status: 'completed',
            notebook_url: notebookUrl,
            completed_at: new Date().toISOString(),
        });
        if (error) console.warn('Failed to log import history:', error.message); // supabase-js returns errors, it doesn't throw
    } catch (err) {
        console.warn('Failed to log import history:', err.message);
    }
}
