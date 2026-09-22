const crypto = require('crypto');
const sessionsDb = require('../db/sessions');
const apiKeysDb = require('../db/apiKeys');

function getCookieOptions() {
  const isProduction = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProduction || process.env.COOKIE_SECURE === 'true',
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
  };
}

/**
 * POST /api/v1/auth/session
 * Establishes a new web session using a valid Bearer API key.
 */
async function createSession(req, res) {
  const { api_key } = req.body || {};

  if (!api_key || typeof api_key !== 'string') {
    return res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Valid api_key required in request body'
      }
    });
  }

  const apiKeyHash = crypto
    .createHash('sha256')
    .update(api_key.trim())
    .digest('hex');

  const keyRecord = await apiKeysDb.findApiKeyByHash(apiKeyHash);
  if (!keyRecord || keyRecord.revoked_at !== null) {
    return res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid or revoked API key'
      }
    });
  }

  const userId = keyRecord.user_id;
  const rawSessionId = `sess_${crypto.randomBytes(32).toString('hex')}`;
  const rawCsrfToken = `csrf_${crypto.randomBytes(32).toString('hex')}`;

  const sessionIdHash = crypto.createHash('sha256').update(rawSessionId).digest('hex');
  const csrfTokenHash = crypto.createHash('sha256').update(rawCsrfToken).digest('hex');

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await sessionsDb.createSession({
    sessionIdHash,
    userId,
    csrfTokenHash,
    expiresAt
  });

  res.cookie('sid', rawSessionId, getCookieOptions());

  return res.status(201).json({
    user_id: userId,
    csrf_token: rawCsrfToken,
    expires_at: expiresAt.toISOString()
  });
}

/**
 * GET /api/v1/auth/session
 * Verifies active web session cookie and returns user identity + rotated CSRF token.
 */
async function getSession(req, res) {
  const sid = req.cookies?.sid;

  if (!sid || typeof sid !== 'string') {
    return res.status(401).json({
      authenticated: false
    });
  }

  const sessionIdHash = crypto.createHash('sha256').update(sid).digest('hex');
  const session = await sessionsDb.findSessionByHash(sessionIdHash);

  if (!session) {
    return res.status(401).json({
      authenticated: false
    });
  }

  const newRawCsrfToken = `csrf_${crypto.randomBytes(32).toString('hex')}`;
  const newCsrfTokenHash = crypto.createHash('sha256').update(newRawCsrfToken).digest('hex');

  await sessionsDb.updateLastSeenAndCsrf(sessionIdHash, newCsrfTokenHash);

  return res.status(200).json({
    authenticated: true,
    user_id: session.user_id,
    csrf_token: newRawCsrfToken
  });
}

/**
 * DELETE /api/v1/auth/session
 * Terminates web session and clears session cookie.
 */
async function deleteSession(req, res) {
  const sid = req.cookies?.sid;

  if (sid && typeof sid === 'string') {
    const sessionIdHash = crypto.createHash('sha256').update(sid).digest('hex');
    await sessionsDb.revokeSession(sessionIdHash);
  }

  const clearOptions = {
    ...getCookieOptions(),
    maxAge: 0
  };

  res.clearCookie('sid', clearOptions);

  return res.status(200).json({
    message: 'Logged out successfully'
  });
}

module.exports = {
  createSession,
  getSession,
  deleteSession,
};
