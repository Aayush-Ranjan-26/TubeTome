import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';

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
 *   refreshSession — manual session refresh fallback
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
                .select('id, display_name, avatar_url')
                .eq('id', userId)
                .single();
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
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                // Use current origin + trailing slash so it matches Supabase's
                // wildcard redirect pattern (https://yourdomain.com/**).
                // This works correctly on any deployment URL automatically.
                redirectTo: `${window.location.origin}/`,
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

    // Manual session refresh fallback
    const refreshSession = useCallback(async () => {
        const { data: { session: s }, error } = await supabase.auth.refreshSession();
        if (error) throw error;
        setSession(s);
        setUser(s?.user ?? null);
        if (s?.user) fetchProfile(s.user.id);
        return s;
    }, [fetchProfile]);

    return { user, session, profile, loading, signIn, signOut, refreshSession };
}

/**
 * Log an import to the import_history table.
 */
export async function logImportHistory(userId, playlistUrl, playlistTitle, videoCount, selectionMode) {
    if (!userId) return;
    try {
        await supabase.from('import_history').insert({
            user_id: userId,
            playlist_url: playlistUrl,
            playlist_title: playlistTitle,
            video_count: videoCount,
            selection_mode: selectionMode,
        });
    } catch (err) {
        console.warn('Failed to log import history:', err.message);
    }
}
