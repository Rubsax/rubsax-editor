const YT_ID_REGEX = /^[A-Za-z0-9_-]{11}$/;

/**
 * Extrai com segurança apenas o ID de 11 caracteres de um link ou código <iframe> do YouTube.
 * Nunca retorna HTML arbitrário, mitigando riscos de XSS.
 */
export function extractYouTubeVideoId(rawInput: string): string | null {
  const trimmed = (rawInput || '').trim();
  if (!trimmed) return null;

  let candidate = trimmed;

  // Se o usuário colou o código <iframe ... src="..."> completo do YouTube, extrai apenas o src
  if (candidate.toLowerCase().includes('<iframe')) {
    const srcMatch = candidate.match(/src\s*=\s*["']([^"']+)["']/i);
    if (!srcMatch || !srcMatch[1]) return null;
    candidate = srcMatch[1].trim();
  }

  // Se já for o ID puro de 11 caracteres
  if (YT_ID_REGEX.test(candidate)) {
    return candidate;
  }

  try {
    const normalizedUrl = /^https?:\/\//i.test(candidate)
      ? candidate
      : candidate.startsWith('//')
      ? `https:${candidate}`
      : `https://${candidate}`;
    const url = new URL(normalizedUrl);
    const host = url.hostname.toLowerCase();

    const isYouTubeHost =
      host === 'youtu.be' ||
      host.endsWith('.youtu.be') ||
      host.includes('youtube.com') ||
      host.includes('youtube-nocookie.com');

    if (!isYouTubeHost) {
      return null;
    }

    if (host === 'youtu.be' || host.endsWith('.youtu.be')) {
      const seg = url.pathname.split('/').filter(Boolean)[0] || '';
      return YT_ID_REGEX.test(seg) ? seg : null;
    }

    const vParam = url.searchParams.get('v') || '';
    if (YT_ID_REGEX.test(vParam)) {
      return vParam;
    }

    const parts = url.pathname.split('/').filter(Boolean);
    const markers = ['embed', 'shorts', 'live', 'v'];
    for (let i = 0; i < parts.length; i++) {
      if (markers.includes(parts[i]) && parts[i + 1] && YT_ID_REGEX.test(parts[i + 1])) {
        return parts[i + 1];
      }
    }
  } catch {
    return null;
  }

  return null;
}

export function getYouTubeEmbedUrl(videoId: string): string {
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(
    videoId
  )}?rel=0&modestbranding=1`;
}

export function getYouTubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
}
