import axios from "axios";
import { ToolParams } from "../types";
import { extractForRetailer } from "../utils/extractors";
import { errorResponse } from "../utils/response";

const HEADERS = {
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
      headers: HEADERS,
      timeout: 15_000,
      maxRedirects: 5,
      // Some retailers return gzip — axios handles this automatically
      decompress: true,
    });

    const html = response.data;
    const content = extractForRetailer(html, retailer);
    console.log(`Fetched ${url} (category: ${category}, retailer: ${retailer}) - content length: ${content.length}`);
    return JSON.stringify({
      success: true,
      url,
      category,
      retailer,
      content,
      rawLength: html.length,
      contentType: response.headers["content-type"] ?? "unknown",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errorResponse(`Failed to fetch ${url}: ${message}`);
  }
}