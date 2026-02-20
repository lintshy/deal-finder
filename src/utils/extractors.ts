// Retailer-specific strategies for extracting embedded JSON from HTML
// Always prefer hitting the underlying XHR API directly if you can find it

export function extractNikeData(html: string): string | null {
  const match = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/
  );
  return match ? match[1].slice(0, 60_000) : null;
}

export function extractMacysData(html: string): string | null {
  const match = html.match(
    /window\.__PRELOADED_STATE__\s*=\s*({[\s\S]*?});\s*<\/script>/
  );
  return match ? match[1].slice(0, 60_000) : null;
}

type ExtractorFn = (html: string) => string | null;

const EXTRACTORS: Record<string, ExtractorFn> = {
  nike: extractNikeData,
  macys: extractMacysData,
};

export function extractForRetailer(
  html: string,
  retailer: string
): string {
  const fn = EXTRACTORS[retailer.toLowerCase()];
  if (fn) {
    const result = fn(html);
    if (result) return result;
  }
  // Fallback: return trimmed raw HTML
  return html.slice(0, 30_000);
}