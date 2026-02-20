import { BedrockAgentEvent, BedrockAgentResponse, ToolHandler } from "./types";
import { buildResponse, parseParams, errorResponse } from "./utils/response";
import { fetchPage } from "./tools/fetchPage";
import { parseDeals } from "./tools/parseDeals";
import { saveDeals } from "./tools/saveDeals";

const TOOL_MAP: Record<string, ToolHandler> = {
  fetch_page: fetchPage,
  parse_deals: parseDeals,
  save_deals: saveDeals,
};

export const handler = async (
  event: BedrockAgentEvent
): Promise<BedrockAgentResponse> => {
  console.log("Bedrock Agent event:", JSON.stringify(event, null, 2));

  const { function: functionName } = event;
  const params = parseParams(event);

  const toolFn = TOOL_MAP[functionName];

  if (!toolFn) {
    return buildResponse(
      event,
      errorResponse(`Unknown function: ${functionName}. Available: ${Object.keys(TOOL_MAP).join(", ")}`)
    );
  }

  try {
    const result = await toolFn(params);
    return buildResponse(event, result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Tool ${functionName} threw an unhandled error:`, message);
    return buildResponse(event, errorResponse(`Unhandled error in ${functionName}: ${message}`));
  }
};