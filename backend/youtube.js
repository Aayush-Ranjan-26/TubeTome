import { google } from 'googleapis';

/**
 * Creates a lazily-initialized YouTube client.
 * This ensures dotenv has loaded before we read the key.
 */
function getClient() {
    const key = process.env.YOUTUBE_API_KEY;
    if (!key) throw new Error('YOUTUBE_API_KEY is not set in .env');
    return google.youtube({ version: 'v3', auth: key });
}

/**
 * Fetches playlist title and all video items (handles pagination).
 * @param {string} playlistId
 * @returns {{ title: string, videos: Array<{title: string, url: string, thumbnail: string}> }}
 */
export async function fetchPlaylistVideos(playlistId) {
    const yt = getClient();

    // 1. Playlist metadata
    let meta;
    try {
        meta = await yt.playlists.list({ part: 'snippet', id: playlistId });
    } catch (err) {
        const status = err?.response?.status;
        const reason = err?.errors?.[0]?.reason || err?.response?.data?.error?.errors?.[0]?.reason;
        if (status === 400 || status === 403) {
            throw new Error(`YouTube API error (${status}${reason ? ': ' + reason : ''}). Check your API key and quota.`);
        }
        throw new Error(`YouTube API unreachable: ${err.message}`);
    }

    if (!meta.data.items?.length) {
        throw new Error('Playlist not found. It may be private or deleted.');
    }
    const title = meta.data.items[0].snippet.title;

    // 2. All video items with pagination
    // SECURITY: Cap at 20 pages (1,000 videos) to prevent API quota abuse
    const MAX_PAGES = 20;
    const videos = [];
    let pageToken = undefined;
    let pageCount = 0;

    do {
        pageCount++;
        let res;
        try {
            res = await yt.playlistItems.list({
                part: 'snippet',
                playlistId,
                maxResults: 50,
                pageToken,
            });
        } catch (err) {
            const status = err?.response?.status;
            const reason = err?.errors?.[0]?.reason || err?.response?.data?.error?.errors?.[0]?.reason;
            throw new Error(`YouTube API error fetching items (${status || 'unknown'}${reason ? ': ' + reason : ''})`);
        }

        for (const item of res.data.items || []) {
            const vid = item.snippet?.resourceId?.videoId;
            if (!vid) continue; // skip deleted/private entries
            videos.push({
                title: item.snippet.title,
                url: `https://www.youtube.com/watch?v=${vid}`,
                thumbnail: item.snippet.thumbnails?.medium?.url
                    || item.snippet.thumbnails?.default?.url
                    || '',
            });
        }

        pageToken = res.data.nextPageToken;
    } while (pageToken && pageCount < MAX_PAGES);

    if (pageToken) {
        console.warn(`[youtube] Playlist ${playlistId} truncated at ${videos.length} videos (${MAX_PAGES} pages cap)`);
    }

    return { title, videos };
}
