const crypto = require('crypto');

const BASE62_ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const ALPHABET_LENGTH = BASE62_ALPHABET.length; // 62
const SHORT_CODE_LENGTH = 6;

// Rejection sampling threshold: largest multiple of 62 below 256 is 248 (62 * 4)
// Any random byte >= 248 is discarded to prevent modulo bias.
const REJECTION_THRESHOLD = 248;

/**
 * Generates a cryptographically secure random 6-character Base62 short code.
 * Uses rejection sampling to eliminate modulo bias.
 *
 * @returns {string} Exactly 6-character Base62 string
 */
function generateShortCode() {
  let code = '';
  while (code.length < SHORT_CODE_LENGTH) {
    const bytes = crypto.randomBytes(SHORT_CODE_LENGTH * 2);
    for (let i = 0; i < bytes.length && code.length < SHORT_CODE_LENGTH; i++) {
      const byte = bytes[i];
      if (byte < REJECTION_THRESHOLD) {
        code += BASE62_ALPHABET[byte % ALPHABET_LENGTH];
      }
    }
  }
  return code;
}

module.exports = {
  generateShortCode,
  BASE62_ALPHABET,
  SHORT_CODE_LENGTH,
};
