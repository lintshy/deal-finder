import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, BatchWriteCommand } from "@aws-sdk/lib-dynamodb";
import { Deal, ToolParams } from "../types";
import { errorResponse } from "../utils/response";

const isLocal = process.env.IS_LOCAL === "true";
const dynamoEndpoint = process.env.DYNAMODB_ENDPOINT; // set by docker-compose

const client = new DynamoDBClient(
  isLocal && dynamoEndpoint
    ? {
      endpoint: dynamoEndpoint,
      region: "us-east-1",
      credentials: { accessKeyId: "fake", secretAccessKey: "fake" },
    }
    : {} // in real Lambda, SDK picks up IAM role automatically
);
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.DEALS_TABLE_NAME ?? "Deals";
const TTL_HOURS = 48;

export async function saveDeals(params: ToolParams): Promise<string> {
  const { deals: dealsRaw } = params;

  if (!dealsRaw) return errorResponse("deals parameter is required");

  let deals: Deal[];
  try {
    deals = JSON.parse(dealsRaw) as Deal[];
    console.log("[saveDeals] Starting batch write", {
      totalDeals: deals.length,
      retailers: [...new Set(deals.map(d => d.retailer))],
      categories: [...new Set(deals.map(d => d.category))],
      table: TABLE_NAME,
    });
  } catch {
    return errorResponse("deals must be a valid JSON array string");
  }

  if (!Array.isArray(deals) || deals.length === 0) {
    return errorResponse("deals must be a non-empty array");
  }

  const ttl = Math.floor(Date.now() / 1000) + TTL_HOURS * 3600;
  const scrapedAt = new Date().toISOString();

  // DynamoDB BatchWrite accepts max 25 items per call — chunk accordingly
  const chunks = chunkArray(deals, 25);
  const errors: string[] = [];
  let saved = 0;

  for (const [index, chunk] of chunks.entries()) {
    const putRequests = chunk.map((deal) => ({
      PutRequest: {
        Item: {
          pk: `${deal.retailer}#${deal.category}`,
          sk: deal.id,
          name: deal.name,
          retailer: deal.retailer,
          category: deal.category,
          originalPrice: deal.originalPrice,   // store as Number
          salePrice: deal.salePrice,
          discountPct: deal.discountPct,
          imageUrl: deal.imageUrl,
          productUrl: deal.productUrl,
          scrapedAt,
          ttl,
        },
      },
    }));

    try {
      const command = new BatchWriteCommand({
        RequestItems: { [TABLE_NAME]: putRequests },
      });
      const result = await docClient.send(command);

      // Handle unprocessed items (DynamoDB throttling)
      const unprocessed =
        result.UnprocessedItems?.[TABLE_NAME]?.length ?? 0;
      saved += chunk.length - unprocessed;

      console.log(`[saveDeals] ✅ Chunk ${index + 1} written successfully`, {
        attempted: chunk.length,
        saved,
        unprocessed,
        ttlExpiry: new Date(ttl * 1000).toISOString(),
      });

      if (unprocessed > 0) {
        const msg = `${unprocessed} items unprocessed in chunk ${index + 1} (DynamoDB throttling)`;
        console.warn(`[saveDeals] ⚠️ ${msg}`);
        errors.push(msg);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`Batch write failed: ${message}`);
    }
  }
  console.log(`[saveDeals] Completed with ${saved} deals saved and ${errors.length} errors`);
  return JSON.stringify({
    success: errors.length === 0,
    saved,
    total: deals.length,
    errors,
  });
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}