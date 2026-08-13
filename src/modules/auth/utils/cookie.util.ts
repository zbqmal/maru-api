export function getCookieValue(
  cookieHeader: string | undefined,
  cookieName: string,
): string | undefined {
  if (cookieHeader === undefined) {
    return undefined;
  }

  for (const entry of cookieHeader.split(';')) {
    const [rawName, ...rawValueParts] = entry.trim().split('=');

    if (rawName !== cookieName || rawValueParts.length === 0) {
      continue;
    }

    const rawValue = rawValueParts.join('=');

    try {
      return decodeURIComponent(rawValue);
    } catch {
      return rawValue;
    }
  }

  return undefined;
}
