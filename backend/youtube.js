import { google } from 'googleapis';

/**
 * Creates a lazily-initialized YouTube client.
 * This ensures dotenv has loaded before we read the key.
 */
let _yt = null;
function getClient() {
    if (!_yt) {
        const key = process.env.YOUTUBE_API_KEY;
        if (!key) throw new Error('YOUTUBE_API_KEY is not set in .env');
        _yt = google.youtube({ version: 'v3', auth: key });
    }
    return _yt;
}

/**
 * Fetches playlist title and all video items (handles pagination).
 * @param {string} playlistId
 * @returns {{ title: string, videos: Array<{title: string, url: string, thumbnail: string}> }}
 */
export async function fetchPlaylistVideos(playlistId) {
    const yt = getClient();

    // 1. Playlist metadata
    const meta = await yt.playlists.list({ part: 'snippet', id: playlistId });
    if (!meta.data.items?.length) {
        throw new Error('Playlist not found. It may be private or deleted.');
    }
    const title = meta.data.items[0].snippet.title;

    // 2. All video items with pagination
    const videos = [];
    let pageToken = undefined;

    do {
        const res = await yt.playlistItems.list({
            part: 'snippet',
            playlistId,
            maxResults: 50,
            pageToken,
        });

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
    } while (pageToken);

    return { title, videos };
}
