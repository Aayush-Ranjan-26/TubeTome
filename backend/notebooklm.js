/**
 * MOCKED NOTEBOOKLM WRAPPER
 *
 * TODO: Replace with real HTTP calls once NotebookLM API docs are provided.
 * Each function signature matches the expected real API contract.
 */

export async function listNotebooks(token) {
    console.log(`[MOCK] listNotebooks – token present: ${Boolean(token)}`);
    return [{ id: 'mock-1', title: 'React Crash Course' }];
}

export async function createNotebook(token, title) {
    console.log(`[MOCK] createNotebook: "${title}"`);
    return { id: `nb_${Date.now()}`, title };
}

export async function addSources(token, notebookId, sourceUrls) {
    console.log(`[MOCK] addSources → ${notebookId} (${sourceUrls.length} urls)`);
    return { success: true, added: sourceUrls.length };
}
