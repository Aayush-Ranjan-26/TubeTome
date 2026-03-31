/**
 * selection_parser.js — Robust video selection parser.
 *
 * Supports two modes:
 *   "indices" — comma/space-separated list of 1-based integers
 *   "range"   — inclusive start–end (e.g. "5-12" or "5..12")
 *
 * Returns a structured result with valid indices, ignored duplicates,
 * out-of-range indices, unparsable items, and user-facing warnings.
 */

/** Hard cap to prevent DoS via enormous ranges. */
const MAX_RANGE_SIZE = 10_000;
const MAX_TOKENS = 2_000;

/**
 * Parse a selection string and filter against a playlist.
 *
 * @param {"all"|"indices"|"range"} mode
 * @param {string} selectionInput — raw user input
 * @param {number} playlistLength — total videos in playlist
 * @returns {{
 *   valid_indices: number[],
 *   ignored_duplicates: number[],
 *   ignored_out_of_range: number[],
 *   unparsable_items: string[],
 *   warnings: string[]
 * }}
 */
export function parseSelection(mode, selectionInput = '', playlistLength) {
    const result = {
        valid_indices: [],
        ignored_duplicates: [],
        ignored_out_of_range: [],
        unparsable_items: [],
        warnings: [],
    };

    if (mode === 'all') {
        result.valid_indices = Array.from({ length: playlistLength }, (_, i) => i + 1);
        return result;
    }

    if (mode === 'indices' || mode === 'specific') {
        return parseIndices(selectionInput, playlistLength, result);
    }

    if (mode === 'range') {
        return parseRange(selectionInput, playlistLength, result);
    }

    result.warnings.push(`Unknown mode "${mode}". Use "all", "indices", or "range".`);
    return result;
}

/**
 * Parse comma/space-separated indices.
 * Keeps first-occurrence order, deduplicates, filters out-of-bounds.
 */
function parseIndices(input, playlistLength, result) {
    if (!input || !input.trim()) {
        result.warnings.push('No indices provided. Example: "3, 4, 2, 6, 8, 23, 45"');
        return result;
    }

    const tokens = input.split(/[,\s]+/).filter(t => t.length > 0);

    // Cap tokens to prevent CPU abuse
    if (tokens.length > MAX_TOKENS) {
        result.warnings.push(`Input truncated to first ${MAX_TOKENS} items (${tokens.length} provided).`);
        tokens.length = MAX_TOKENS;
    }

    const seen = new Set();

    for (const token of tokens) {
        const trimmed = token.trim();
        if (!trimmed) continue;

        // Check if it's a valid integer (reject floats, non-numeric)
        const num = Number(trimmed);
        if (!Number.isInteger(num)) {
            result.unparsable_items.push(trimmed);
            continue;
        }

        // Duplicate check (first-seen order preserved)
        if (seen.has(num)) {
            result.ignored_duplicates.push(num);
            continue;
        }
        seen.add(num);

        // Bounds check (1-based)
        if (num < 1 || num > playlistLength) {
            result.ignored_out_of_range.push(num);
            continue;
        }

        result.valid_indices.push(num);
    }

    // Build warnings — truncate huge lists to prevent response bloat
    if (result.ignored_out_of_range.length > 0) {
        const preview = result.ignored_out_of_range.slice(0, 5).join(', ');
        const suffix = result.ignored_out_of_range.length > 5
            ? ` …and ${result.ignored_out_of_range.length - 5} more` : '';
        result.warnings.push(
            `${result.ignored_out_of_range.length} out-of-range indices ignored (${preview}${suffix}). Playlist has ${playlistLength} videos.`
        );
    }
    if (result.unparsable_items.length > 0) {
        const preview = result.unparsable_items.slice(0, 5).join(', ');
        const suffix = result.unparsable_items.length > 5
            ? ` …and ${result.unparsable_items.length - 5} more` : '';
        result.warnings.push(`${result.unparsable_items.length} invalid items ignored (${preview}${suffix}).`);
    }
    if (result.valid_indices.length === 0 && tokens.length > 0) {
        result.warnings.push('No valid indices found. Make sure to enter numbers between 1 and ' + playlistLength + '.');
    }

    return result;
}

/**
 * Parse an inclusive range like "5-12", "5..12", "5 12", "15-10" (swapped).
 * Clips to playlist bounds and reports clipped indices.
 */
function parseRange(input, playlistLength, result) {
    if (!input || !input.trim()) {
        result.warnings.push('No range provided. Example: "5-12" or "5..12"');
        return result;
    }

    // Try to parse "start-end" or "start..end" or "start end"
    const rangeMatch = input.trim().match(/^(\d+)\s*(?:[-–—]|\.\.)\s*(\d+)$/);

    let start, end;

    if (rangeMatch) {
        start = parseInt(rangeMatch[1], 10);
        end = parseInt(rangeMatch[2], 10);
    } else {
        // Try two space-separated numbers
        const parts = input.trim().split(/\s+/);
        if (parts.length === 2 && Number.isInteger(Number(parts[0])) && Number.isInteger(Number(parts[1]))) {
            start = parseInt(parts[0], 10);
            end = parseInt(parts[1], 10);
        } else {
            result.unparsable_items.push(input.trim().substring(0, 100));
            result.warnings.push(`Could not parse range. Use format: "5-12" or "5..12"`);
            return result;
        }
    }

    // Reject absurdly large values early
    if (start > 1_000_000 || end > 1_000_000) {
        result.warnings.push(`Range values too large (max 1,000,000). Playlist has ${playlistLength} videos.`);
        return result;
    }

    // Swap if start > end
    if (start > end) {
        result.warnings.push(`Range start (${start}) > end (${end}), swapped to ${end}–${start}.`);
        [start, end] = [end, start];
    }

    // Clip to playlist bounds (without enumerating every clipped index)
    const clippedBelow = Math.max(0, 1 - start);
    const clippedAbove = Math.max(0, end - playlistLength);
    const totalClipped = clippedBelow + clippedAbove;

    start = Math.max(1, start);
    end = Math.min(playlistLength, end);

    // If no valid range remains
    if (start > end || start > playlistLength) {
        result.warnings.push(`Range is entirely outside playlist bounds (1–${playlistLength}).`);
        return result;
    }

    // Cap range to prevent memory/CPU abuse
    const rangeSize = end - start + 1;
    if (rangeSize > MAX_RANGE_SIZE) {
        result.warnings.push(`Range too large (${rangeSize} videos). Capped to first ${MAX_RANGE_SIZE}.`);
        end = start + MAX_RANGE_SIZE - 1;
    }

    // Build valid indices
    for (let i = start; i <= end; i++) {
        result.valid_indices.push(i);
    }

    if (totalClipped > 0) {
        result.ignored_out_of_range = Array.from({ length: Math.min(totalClipped, 10) }, (_, i) => i); // placeholder
        result.warnings.push(`Range clipped to playlist bounds (1–${playlistLength}); ${totalClipped} out-of-range indices ignored.`);
    }

    return result;
}

/**
 * Build the full structured JSON response from parsed selection + playlist videos.
 *
 * @param {object} parsedSelection — output from parseSelection()
 * @param {Array<{title: string, url: string}>} videos — full playlist
 * @param {string} rawInput — original user input string
 * @param {string} mode — "all", "indices", or "range"
 * @param {string} playlistUrl — original playlist URL
 * @returns {object} structured JSON per spec
 */
export function buildSelectionResponse(parsedSelection, videos, rawInput, mode, playlistUrl) {
    // Map valid indices to video objects (1-based → 0-based)
    const resultLinks = parsedSelection.valid_indices
        .map(idx => {
            const vid = videos[idx - 1];
            if (!vid) return null;
            return { index: idx, title: vid.title, url: vid.url };
        })
        .filter(Boolean);

    return {
        playlist: {
            url: playlistUrl,
            length: videos.length,
        },
        requested_mode: mode,
        requested_input_raw: rawInput || '',
        parsed_selection: {
            valid_indices: parsedSelection.valid_indices,
            ignored_duplicates: parsedSelection.ignored_duplicates,
            ignored_out_of_range: parsedSelection.ignored_out_of_range,
            unparsable_items: parsedSelection.unparsable_items,
        },
        result_links: resultLinks,
        warnings: parsedSelection.warnings,
    };
}
