// Product data extractors for HTML pages.
// All extractors normalize their output to FetchedProduct[] so fetchPage
// returns a standard shape regardless of the source site.

import { FetchedProduct } from "../types";

// ─── Price helpers ────────────────────────────────────────────────────────────

interface SchemaOffer {
  "@type"?: string;
  price?: number | string;
  lowPrice?: number | string;
  highPrice?: number | string;
  priceCurrency?: string;
  priceType?: string;
  priceSpecification?: SchemaOffer | SchemaOffer[];
}

interface SchemaProduct {
  "@id"?: string;
  name?: string;
  url?: string;
  image?: string | string[] | { url?: string };
  offers?: SchemaOffer | SchemaOffer[];
}

function extractPrices(offers: SchemaOffer | SchemaOffer[] | undefined): {
  sale: number | null;
  original: number | null;
  currency: string;
} {
  if (!offers) return { sale: null, original: null, currency: "USD" };

  const offerArr = Array.isArray(offers) ? offers : [offers];
  let sale: number | null = null;
  let original: number | null = null;
  let currency = "USD";

  for (const offer of offerArr) {
    if (!offer) continue;

    if (offer.priceCurrency) currency = offer.priceCurrency;

    // AggregateOffer: lowPrice = sale price, highPrice = original/list price
    if (offer["@type"] === "AggregateOffer") {
      if (offer.lowPrice  != null) sale     = parseFloat(String(offer.lowPrice));
      if (offer.highPrice != null) original = parseFloat(String(offer.highPrice));
      continue;
    }

    // Offer with explicit priceType label
    if (offer.priceType === "SalePrice" && offer.price != null) {
      sale = parseFloat(String(offer.price)); continue;
    }
    if (offer.priceType === "ListPrice" && offer.price != null) {
      original = parseFloat(String(offer.price)); continue;
    }

    // priceSpecification array inside an Offer
    if (offer.priceSpecification) {
      const specs = Array.isArray(offer.priceSpecification)
        ? offer.priceSpecification
        : [offer.priceSpecification];
      for (const spec of specs) {
        if (!spec) continue;
        const t = spec["@type"] ?? spec.priceType ?? "";
        if (/sale/i.test(t)  && spec.price != null) sale     = parseFloat(String(spec.price));
        if (/list/i.test(t)  && spec.price != null) original = parseFloat(String(spec.price));
      }
      continue;
    }

    // Plain Offer — treat as sale price if we don't have one yet
    if (sale === null && offer.price != null) sale = parseFloat(String(offer.price));
  }

  return { sale, original, currency };
}

function resolveImage(image: SchemaProduct["image"]): string {
  if (!image) return "";
  if (typeof image === "string") return image;
  if (Array.isArray(image)) return typeof image[0] === "string" ? image[0] : "";
  return image.url ?? "";
}

function toFetchedProduct(p: SchemaProduct, category: string): FetchedProduct {
  const { sale, original, currency } = extractPrices(p.offers);
  return {
    name: p.name ?? "Unknown",
    category,
    originalPrice: original,
    salePrice: sale,
    currency,
    imageUrl: resolveImage(p.image),
    productUrl: p.url ?? "",
  };
}

// ─── Generic: schema.org JSON-LD ─────────────────────────────────────────────

/**
 * Extract and normalize all schema.org Product objects from a page's JSON-LD
 * script blocks into FetchedProduct[].
 */
export function extractJsonLdProducts(html: string, category: string): FetchedProduct[] {
  const scriptRe = /<script\s[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const products: FetchedProduct[] = [];

  for (const match of html.matchAll(scriptRe)) {
    let parsed: unknown;
    try { parsed = JSON.parse(match[1]); } catch { continue; }

    const items: unknown[] = Array.isArray(parsed) ? parsed : [parsed];

    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      const obj = item as Record<string, unknown>;

      if (obj["@type"] === "Product") {
        products.push(toFetchedProduct(obj as SchemaProduct, category));
      } else if (obj["@type"] === "ItemList") {
        const elements = (obj["itemListElement"] as Array<Record<string, unknown>>) ?? [];
        for (const el of elements) {
          const inner = (el["item"] ?? el) as Record<string, unknown>;
          if (inner?.["@type"] === "Product") {
            products.push(toFetchedProduct(inner as SchemaProduct, category));
          }
        }
      }
    }
  }

  return products;
}

// ─── Next.js __NEXT_DATA__ fallback ──────────────────────────────────────────
//
// Sites built with Next.js embed server-side state in __NEXT_DATA__. When a
// site doesn't include schema.org JSON-LD, we read that blob and normalize
// products to FetchedProduct[].
//
// To add another Next.js retailer, add a normalizer below and call it from
// extractNextDataProducts() after detecting a site-specific state key.

interface NikeWallProduct {
  globalProductId?: string;
  copy?: { title?: string; subTitle?: string };
  prices?: { currentPrice?: number; initialPrice?: number; currency?: string };
  colorwayImages?: { portraitURL?: string };
  pdpUrl?: { url?: string };
}

function normalizeNikeWall(
  state: Record<string, unknown>,
  category: string
): FetchedProduct[] {
  const groupings = (state?.Wall as Record<string, unknown>)
    ?.productGroupings as Array<{ products?: NikeWallProduct[] }> ?? [];

  return groupings.flatMap((group) =>
    (group.products ?? []).map((p): FetchedProduct => ({
      name: [p.copy?.title, p.copy?.subTitle].filter(Boolean).join(" — ") || "Unknown",
      category,
      originalPrice: p.prices?.initialPrice  ?? null,
      salePrice:     p.prices?.currentPrice  ?? null,
      currency:      p.prices?.currency      ?? "USD",
      imageUrl:      p.colorwayImages?.portraitURL ?? "",
      productUrl:    p.pdpUrl?.url ?? "",
    }))
  );
}

/**
 * Extract products from a Next.js __NEXT_DATA__ blob and normalize them to
 * FetchedProduct[]. Returns an empty array if the blob is absent or contains
 * no recognizable product structure.
 */
export function extractNextDataProducts(html: string, category: string): FetchedProduct[] {
  const match = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/
  );
  if (!match) return [];

  let data: Record<string, unknown>;
  try { data = JSON.parse(match[1]); } catch { return []; }

  const state = (
    (data?.props as Record<string, unknown>)?.pageProps as Record<string, unknown>
  )?.initialState as Record<string, unknown>;

  if (!state) return [];

  // Nike: Wall.productGroupings[]
  if (state.Wall) return normalizeNikeWall(state, category);

  return [];
}
