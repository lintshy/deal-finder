import axios from "axios";
import {
    BedrockRuntimeClient,
    InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { ToolParams } from "../types";
import { errorResponse } from "../utils/response";

const client = new BedrockRuntimeClient({
    region: process.env.AWS_REGION ?? "us-east-1",
});

const MODEL_ID = "us.anthropic.claude-3-haiku-20240307-v1:0";

const BROWSER_HEADERS = {
    "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    Connection: "keep-alive",
};

// Max characters of HTML to send to Claude (keep within token budget)
const MAX_HTML_CHARS = 80_000;

export async function scrapeDeals(params: ToolParams): Promise<string> {
    const { url, retailer, category, min_discount_pct = "30", audience } = params;

    if (!url) return errorResponse("url parameter is required");
    if (!retailer) return errorResponse("retailer parameter is required");
    if (!category) return errorResponse("category parameter is required");

    // Step 1: Fetch the page HTML
    let html: string;
    try {
        const res = await axios.get<string>(url, {
            headers: BROWSER_HEADERS,
            timeout: 15_000,
            maxRedirects: 5,
            decompress: true,
        });
        html = res.data;
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return errorResponse(`Failed to fetch ${url}: ${message}`);
    }

    // Truncate to stay within token limits
    const htmlSnippet = html.length > MAX_HTML_CHARS
        ? html.slice(0, MAX_HTML_CHARS) + "\n<!-- truncated -->"
        : html;

    console.log("[scrapeDeals] Fetched page, asking Claude to extract deals", {
        url,
        htmlLength: html.length,
        truncated: html.length > MAX_HTML_CHARS,
    });

    // Step 2: Ask Claude to extract deals from the HTML
    const prompt = `You are a deal-finding assistant. Below is raw HTML from a retail page.
Extract all products where the sale price is at least ${min_discount_pct}% below the original price.

Retailer: ${retailer}
Category: ${category}
Audience: ${audience}
Minimum discount: ${min_discount_pct}%

Return ONLY a valid JSON array with no extra text, no markdown, no code blocks.
Do not preface the JSON with any comments or explanations like 
"Here is the JSON array with the qualifying deals:"
Each item must have exactly these fields:
{
  "id": "unique product id or slug",
  "name": "product name",
  "category": "${category}",
  "retailer": "${retailer}",
  "originalPrice": 99.99,
  "salePrice": 49.99,
  "discountPct": 50.0,
  "currency": "USD",
  "imageUrl": "https://...",
  "productUrl": "https://..."
}

If no qualifying deals are found, return an empty array: []

HTML:
${htmlSnippet}`;

    try {
        const command = new InvokeModelCommand({
            modelId: MODEL_ID,
            contentType: "application/json",
            accept: "application/json",
            body: JSON.stringify({
                anthropic_version: "bedrock-2023-05-31",
                max_tokens: 4096,
                messages: [{ role: "user", content: prompt }],
            }),
        });

        const response = await client.send(command);
        const responseBody = JSON.parse(new TextDecoder().decode(response.body));

        console.log("[scrapeDeals] Claude stop_reason:", responseBody.stop_reason);

        const textBlock = responseBody.content?.find(
            (b: { type: string }) => b.type === "text"
        );

        if (!textBlock?.text) {
            return errorResponse("Claude did not return a text response");
        }

        const rawText = textBlock.text.trim();
        console.log("[scrapeDeals] Claude raw response:", rawText.slice(0, 500));

        let deals;

        try {
            const cleaned = rawText
                .replace(/^```json\s*/i, "")
                .replace(/^```\s*/i, "")
                .replace(/\s*```$/i, "")
                .trim();
            const [preface, jsonPart] = cleaned.split(/(\[.*\])/s);
            if (jsonPart) {
                deals = JSON.parse(jsonPart);
            }
        } catch {
            return errorResponse(`Claude returned invalid JSON: ${rawText.slice(0, 200)}`);
        }

        if (!Array.isArray(deals)) {
            return errorResponse("Claude response was not a JSON array");
        }

        console.log("[scrapeDeals] ✅ Extracted deals", { count: deals.length, retailer, category });

        return JSON.stringify({
            success: true,
            retailer,
            category,
            dealsFound: deals.length,
            deals,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[scrapeDeals] ❌ Failed", { error: message });
        return errorResponse(`scrapeDeals failed: ${message}`);
    }
}
