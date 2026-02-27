import { Deal, FetchedProduct, ToolParams } from "../types";
import { errorResponse } from "../utils/response";

export async function parseDeals(params: ToolParams): Promise<string> {
  const {
    content,
    retailer,
    category = "",
    min_discount_pct = "30",
  } = params;

  if (!content)  return errorResponse("content parameter is required");
  if (!retailer) return errorResponse("retailer parameter is required");

  const minDiscount = parseFloat(min_discount_pct);

  // content arrives as a JSON string regardless of the schema type —
  // Bedrock serialises all parameters as strings before passing to Lambda.
  let fetchedProducts: FetchedProduct[];
  try {
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed)) throw new Error("not an array");

    // Validate each item has the expected FetchedProduct shape
    fetchedProducts = parsed.map((item: Record<string, unknown>, i: number) => {
      if (!item || typeof item !== "object") throw new Error(`item ${i} is not an object`);
      return {
        name:          String(item.name          ?? "Unknown"),
        category:      String(item.category      ?? category),
        originalPrice: item.originalPrice != null ? Number(item.originalPrice) : null,
        salePrice:     item.salePrice     != null ? Number(item.salePrice)     : null,
        currency:      String(item.currency      ?? "USD"),
        imageUrl:      String(item.imageUrl      ?? ""),
        productUrl:    String(item.productUrl    ?? ""),
      } satisfies FetchedProduct;
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return errorResponse(`content must be the products array from fetch_page: ${msg}`);
  }

  const deals = fetchedProducts.reduce<Deal[]>((acc, p) => {
    const { originalPrice, salePrice } = p;
    if (!originalPrice || !salePrice || salePrice >= originalPrice) return acc;

    const discountPct = Math.round((1 - salePrice / originalPrice) * 1000) / 10;
    if (discountPct < minDiscount) return acc;

    acc.push({
      id: crypto.randomUUID(),
      name: p.name,
      category: p.category || category,
      retailer,
      originalPrice,
      salePrice,
      discountPct,
      imageUrl: p.imageUrl,
      productUrl: p.productUrl,
    });

    return acc;
  }, []);

  console.log(`Parsed deals for ${retailer} (category: ${category}) - found ${deals.length} deals with min discount ${minDiscount}%`);
  return JSON.stringify({
    success: true,
    retailer,
    category,
    dealsFound: deals.length,
    deals,
  });
}
