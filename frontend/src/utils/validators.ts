/**
 * Validation utilities adhering strictly to backend URL shortener rules.
 */

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export function validateUrl(url: string): ValidationResult {
  if (!url || typeof url !== 'string') {
    return { valid: false, error: 'Target URL is required' };
  }
  const trimmed = url.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'Target URL cannot be empty' };
  }
  if (trimmed.length > 2048) {
    return { valid: false, error: 'Target URL must not exceed 2048 characters' };
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { valid: false, error: 'URL must use http or https protocol' };
    }
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }

  return { valid: true };
}

export function validateCustomAlias(alias?: string): ValidationResult {
  if (!alias) return { valid: true };
  const trimmed = alias.trim();
  if (trimmed.length === 0) return { valid: true };

  if (trimmed.length < 3 || trimmed.length > 32) {
    return { valid: false, error: 'Custom alias must be between 3 and 32 characters' };
  }

  const aliasRegex = /^[a-zA-Z0-9_-]+$/;
  if (!aliasRegex.test(trimmed)) {
    return { valid: false, error: 'Custom alias may only contain letters, numbers, hyphens, and underscores' };
  }

  return { valid: true };
}

export function validateApiKey(key?: string): ValidationResult {
  if (!key || typeof key !== 'string') {
    return { valid: false, error: 'API key is required' };
  }
  const trimmed = key.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'API key cannot be empty' };
  }
  return { valid: true };
}
