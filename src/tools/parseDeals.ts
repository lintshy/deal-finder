import { Deal, ToolParams } from "../types";
import { errorResponse } from "../utils/response";

export async function parseDeals(params: ToolParams): Promise<string> {
  const {
    content,
    retailer,
    category = "",
    min_discount_pct = "30",
  } = params;

  if (!content) return errorResponse("content parameter is required");
  if (!retailer) return errorResponse("retailer parameter is required");

  const minDiscount = parseFloat(min_discount_pct);

  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch {
    return errorResponse(
      "Content is not valid JSON. Ensure fetch_page returned embedded JSON data, not raw HTML."
    );
  }

  let deals: Deal[] = [];

  try {
    switch (retailer.toLowerCase()) {
      case "nike":
        deals = parseNike(data, category, minDiscount);
        break;
      case "macys":
        deals = parseMacys(data, category, minDiscount);
        break;
      default:
        return errorResponse(`No parser implemented for retailer: ${retailer}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errorResponse(`Parsing failed: ${message}`);
  }
  console.log(`Parsed deals for ${retailer} (category: ${category}) - found ${deals.length} deals with min discount ${minDiscount}%`);
  return JSON.stringify({
    success: true,
    retailer,
    category,
    dealsFound: deals.length,
    deals,
  });
}

// ─── Nike ────────────────────────────────────────────────────────────────────
//
// Source: api.nike.com/cic/browse/v2 (called via fetchPage for Nike URLs).
// Response shape: data.products.products[]
//   .id, .title, .subtitle, .url
//   .images.portraitURL
//   .prices.currentPrice  (number — sale price)
//   .prices.fullPrice     (number — original price)
//   .prices.discounted    (boolean)

interface NikeApiProduct {
  id?: string;
  title?: string;
  subtitle?: string;
  url?: string;
  images?: { portraitURL?: string };
  prices?: {
    currentPrice?: number;
    fullPrice?: number;
    discounted?: boolean;
  };
}

interface NikeApiResponse {
  data?: {
    products?: {
      products?: NikeApiProduct[];
    };
  };
}

function parseNike(data: unknown, category: string, minDiscount: number): Deal[] {
  const root = data as NikeApiResponse;
  const productList: NikeApiProduct[] =
    root?.data?.products?.products ?? [];

  if (productList.length === 0) {
    console.warn("[parseNike] No products found — check API response shape");
  }

  return productList.reduce<Deal[]>((acc, p) => {
    const original = p.prices?.fullPrice;
    const sale = p.prices?.currentPrice;

    if (!original || !sale || sale >= original) return acc;

    const discountPct = Math.round((1 - sale / original) * 1000) / 10;
    if (discountPct < minDiscount) return acc;

    const name = [p.title, p.subtitle].filter(Boolean).join(" — ");

    acc.push({
      id: p.id ?? crypto.randomUUID(),
      name: name || "Unknown",
      category,
      retailer: "nike",
      originalPrice: original,
      salePrice: sale,
      discountPct,
      imageUrl: p.images?.portraitURL ?? "",
      productUrl: `https://www.nike.com${p.url ?? ""}`,
    });

    return acc;
  }, []);
}

// ─── Macy's ───────────────────────────────────────────────────────────────────

interface MacysProduct {
  ID?: number | string;
  name?: string;
  productURL?: string;
  imageURL?: string;
  pricing?: {
    originalPrice?: number;
    salePrice?: number;
  };
}

function parseMacys(data: unknown, category: string, minDiscount: number): Deal[] {
  const root = data as Record<string, unknown>;
  const productList: MacysProduct[] =
    ((root?.product as Record<string, unknown>)?.products as MacysProduct[]) ?? [];

  return productList.reduce<Deal[]>((acc, p) => {
    const original = p.pricing?.originalPrice;
    const sale = p.pricing?.salePrice;

    if (!original || !sale || sale >= original) return acc;

    const discountPct = Math.round((1 - sale / original) * 1000) / 10;
    if (discountPct < minDiscount) return acc;

    acc.push({
      id: String(p.ID ?? crypto.randomUUID()),
      name: p.name ?? "Unknown",
      category,
      retailer: "macys",
      originalPrice: original,
      salePrice: sale,
      discountPct,
      imageUrl: p.imageURL ?? "",
      productUrl: `https://www.macys.com${p.productURL ?? ""}`,
    });

    return acc;
  }, []);
}