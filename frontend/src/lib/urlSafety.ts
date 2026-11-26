/**
 * Strict Client-Side URL Protocol Validation (Mitigates Stored XSS via javascript:/data: URIs).
 */

export function getSafeExternalUrl(rawUrl: string | null | undefined): string | null {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

export function getSafeImageUrl(
  rawUrl: string | null | undefined,
  allowLocalMockAssets = false
): string | null {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  if (allowLocalMockAssets && /^\/mock-media\/[a-zA-Z0-9._-]+\.(?:svg|png|jpe?g|webp)$/.test(trimmed)) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    // Enforce HTTPS-only external cover images (blocks javascript:, data:, cleartext http:)
    if (parsed.protocol === 'https:' && parsed.hostname) {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}
