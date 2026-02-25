// Retailer-specific strategies for obtaining product data.
// For Nike we skip HTML entirely and call their product feed API directly —
// this avoids anti-bot protections and gives us clean, structured JSON.

// ─── Nike API ─────────────────────────────────────────────────────────────────

// Known Nike concept attribute IDs (stable — used in filter params).
// These come from the `selectedConcepts` in the page's __NEXT_DATA__ and
// match the encoded slugs in the /w/ URLs.
const NIKE_CONCEPTS: Record<string, string> = {
  shoes:     "16633190-45e5-4830-a068-232ac7aea82c",
  men:       "0f64ecc7-d624-4e91-b171-b83a03dd8550",
  women:     "7baf216c-acc6-4452-9e07-39c2ca77ba32",
  clearance: "5b21a62a-0503-400c-8336-3ccfbff2a684",
  tops:      "2f9d6a32-6edd-4a9c-8d0c-6b1900b97a17",
  pants:     "0d3f88b0-05a3-4eed-af38-ff31e3c5f2e9",
};

// Map a nike.com store URL to a set of concept IDs to filter by.
// Derived from the human-readable slug (e.g. "mens-sale-shoes").
function conceptIdsForNikeUrl(storeUrl: string): string[] {
  const slug = storeUrl.match(/\/w\/([^?#/]+)/)?.[1]?.toLowerCase() ?? "";
  const ids: string[] = [];

  if (/sale|clearance/.test(slug))  ids.push(NIKE_CONCEPTS.clearance);
  if (/men/.test(slug) && !/women/.test(slug)) ids.push(NIKE_CONCEPTS.men);
  if (/women/.test(slug))           ids.push(NIKE_CONCEPTS.women);
  if (/shoe/.test(slug))            ids.push(NIKE_CONCEPTS.shoes);
  if (/top|shirt|hoodie/.test(slug)) ids.push(NIKE_CONCEPTS.tops);
  if (/pant|tight|legging/.test(slug)) ids.push(NIKE_CONCEPTS.pants);

  return ids;
}

/**
 * Convert a nike.com/w/… store URL into the product feed API URL.
 * The API returns clean JSON with prices — no HTML parsing needed.
 */
export function nikeStoreUrlToApiUrl(storeUrl: string, count = 60): string {
  const conceptIds = conceptIdsForNikeUrl(storeUrl);
  const attributeFilter = conceptIds.length
    ? `&filter=attributeIds(${conceptIds.join(",")})`
    : "";

  const endpoint = [
    "/product_feed/rollup_threads/v2",
    "?filter=marketplace(US)",
    "&filter=language(en)",
    "&filter=employeePrice(true)",
    attributeFilter,
    `&sort=effectiveStartViewDateDesc`,
    `&anchor=0`,
    `&count=${count}`,
  ].join("");

  const params = new URLSearchParams({
    queryid:     "products",
    anonymousId: crypto.randomUUID(),
    country:     "US",
    endpoint,
    language:    "en",
    localizedRangeStr: "{lowestPrice}—{highestPrice}",
  });

  return `https://api.nike.com/cic/browse/v2?${params}`;
}

// ─── Macy's HTML extractor ────────────────────────────────────────────────────

export function extractMacysData(html: string): string | null {
  const match = html.match(
    /window\.__PRELOADED_STATE__\s*=\s*({[\s\S]*?});\s*<\/script>/
  );
  return match ? match[1].slice(0, 60_000) : null;
}

type ExtractorFn = (html: string) => string | null;

const HTML_EXTRACTORS: Record<string, ExtractorFn> = {
  macys: extractMacysData,
};

export function extractForRetailer(html: string, retailer: string): string {
  const fn = HTML_EXTRACTORS[retailer.toLowerCase()];
  if (fn) {
    const result = fn(html);
    if (result) return result;
  }
  // Fallback: trimmed raw HTML
  return html.slice(0, 30_000);
}