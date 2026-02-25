import axios from "axios";
import { ToolParams } from "../types";
import { nikeStoreUrlToApiUrl, extractForRetailer } from "../utils/extractors";
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

const NIKE_API_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json",
  "Accept-Language": "en-US,en;q=0.9",
  "Nike-API-Caller-Id": "com.nike.commerce.nikedotcom.web",
};

export async function fetchPage(params: ToolParams): Promise<string> {
  const { url, category = "", retailer = "" } = params;

  if (!url) return errorResponse("url parameter is required");

  try {
    if (retailer.toLowerCase() === "nike") {
      return await fetchNikeApi(url, category);
    }

    // Generic HTML fetch for other retailers
    const response = await axios.get<string>(url, {
      headers: BROWSER_HEADERS,
      timeout: 15_000,
      maxRedirects: 5,
      decompress: true,
    });

    const html = response.data;
    const content = extractForRetailer(html, retailer);
    console.log(
      `Fetched ${url} (category: ${category}, retailer: ${retailer}) - content length: ${content.length}`
    );
    return JSON.stringify({
      success: true,
      url,
      category,
      retailer,
      content,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errorResponse(`Failed to fetch ${url}: ${message}`);
  }
}

async function fetchNikeApi(storeUrl: string, category: string): Promise<string> {
  const apiUrl = nikeStoreUrlToApiUrl(storeUrl);
  console.log(`[Nike] Calling API: ${apiUrl}`);

  const response = await axios.get<unknown>(apiUrl, {
    headers: NIKE_API_HEADERS,
    timeout: 15_000,
    decompress: true,
  });

  // The API response is already parsed JSON — stringify it for the pipeline
  const content = JSON.stringify(response.data);
  console.log(
    `[Nike] API response received (category: ${category}) - content length: ${content.length}`
  );

  return JSON.stringify({
    success: true,
    url: storeUrl,
    category,
    retailer: "nike",
    content,
  });
}
