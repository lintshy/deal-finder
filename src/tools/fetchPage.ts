import axios from "axios";
import { ToolParams } from "../types";
import { extractJsonLdProducts, extractNextDataProducts } from "../utils/extractors";
import { errorResponse } from "../utils/response";

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  Connection: "keep-alive",
};

export async function fetchPage(params: ToolParams): Promise<string> {
  const { url, category = "", retailer = "" } = params;

  if (!url) return errorResponse("url parameter is required");

  try {
    const response = await axios.get<string>(url, {
      headers: BROWSER_HEADERS,
      timeout: 15_000,
      maxRedirects: 5,
      decompress: true,
    });

    const html = response.data;
    let products = extractJsonLdProducts(html, category);
    let source = "jsonld";

    if (products.length === 0) {
      products = extractNextDataProducts(html, category);
      source = "nextdata";
    }

    if (products.length === 0) {
      console.warn(`[fetchPage] No product data found at ${url}`);
      return JSON.stringify({
        success: false,
        url,
        category,
        retailer,
        error: "No product data found. Neither JSON-LD nor a recognised __NEXT_DATA__ structure was present.",
      });
    }

    console.log(`[fetchPage] Found ${products.length} products via ${source} at ${url} (category: ${category}, retailer: ${retailer})`);

    // Return products as an actual JSON array — not a stringified blob —
    // so the agent can read prices and names directly from the response.
    return JSON.stringify({
      success: true,
      url,
      category,
      retailer,
      products,
      productCount: products.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errorResponse(`Failed to fetch ${url}: ${message}`);
  }
}
