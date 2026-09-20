const API = 'https://www.googleapis.com/youtube/v3';

/** GET a YouTube Data API v3 endpoint; throws messages that server.js's safeErrorMessage lets through. */
async function yt(endpoint, params) {
    const key = process.env.YOUTUBE_API_KEY;
    if (!key) throw new Error('YOUTUBE_API_KEY is not set');
    let res;
    try {
        res = await fetch(`${API}/${endpoint}?${new URLSearchParams({ ...params, key })}`);
    } catch (err) {
        throw new Error(`YouTube API unreachable: ${err.message}`);
    }
    if (!res.ok) {
        const reason = (await res.json().catch(() => ({})))?.error?.errors?.[0]?.reason;
        throw new Error(`YouTube API error (${res.status}${reason ? ': ' + reason : ''}). Check your API key and quota.`);
    }
    return res.json();
}

/**
 * Fetches playlist title and all video items (handles pagination).
 * @param {string} playlistId
 * @returns {{ title: string, videos: Array<{title: string, url: string, thumbnail: string}> }}
 */
export async function fetchPlaylistVideos(playlistId) {
    const meta = await yt('playlists', { part: 'snippet', id: playlistId });
    if (!meta.items?.length) {
        throw new Error('Playlist not found. It may be private or deleted.');
    }
    const title = meta.items[0].snippet.title;

    // SECURITY: Cap at 20 pages (1,000 videos) to prevent API quota abuse
    const MAX_PAGES = 20;
    const videos = [];
    let pageToken;
    let pageCount = 0;

    do {
        pageCount++;
        const page = await yt('playlistItems', {
            part: 'snippet', playlistId, maxResults: 50, ...(pageToken && { pageToken }),
        });

        for (const item of page.items || []) {
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

        pageToken = page.nextPageToken;
    } while (pageToken && pageCount < MAX_PAGES);

    if (pageToken) {
        console.warn(`[youtube] Playlist ${playlistId} truncated at ${videos.length} videos (${MAX_PAGES} pages cap)`);
    }

    return { title, videos };
}
