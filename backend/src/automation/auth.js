/**
 * Auth state — simplified.
 * No longer manages Chrome profiles or encrypted files.
 * Just re-exports CDP availability from chrome_connection.js.
 */
export { isCDPAvailable } from './chrome_connection.js';
