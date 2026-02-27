import { BedrockAgentResponse, ToolHandler } from "./types";
import { buildResponse, errorResponse } from "./utils/response";
import { fetchPage } from "./tools/fetchPage";
import { parseDeals } from "./tools/parseDeals";
import { saveDeals } from "./tools/saveDeals";

// API schema event format (what we're receiving)
interface BedrockApiEvent {
  messageVersion: string;
  actionGroup: string;
  apiPath: string;
  httpMethod: string;
  requestBody?: {
    content?: {
      "application/json"?: {
        properties: Array<{
          name: string;
          type: string;
          value: string;
        }>;
      };
    };
  };
  sessionId: string;
  agent: {
    name: string;
    version: string;
    id: string;
    alias: string;
  };
}

// Function definition event format (alternative)
export interface BedrockFunctionEvent {
  messageVersion: string;
  actionGroup: string;
  function: string;
  parameters: Array<{
    name: string;
    type: string;
    value: string;
  }>;
}

type BedrockEvent = BedrockApiEvent | BedrockFunctionEvent;

const TOOL_MAP: Record<string, ToolHandler> = {
  fetch_page: fetchPage,
  parse_deals: parseDeals,
  save_deals: saveDeals,
};

function extractToolName(event: BedrockEvent): string {
  // API schema format uses apiPath e.g. /fetch_page
  if ("apiPath" in event) {
    return event.apiPath.replace("/", "");
  }
  // Function definition format uses function field
  return (event as BedrockFunctionEvent).function;
}

function extractParams(event: BedrockEvent): Record<string, string> {
  // API schema format
  if ("apiPath" in event) {
    const properties =
      event.requestBody?.content?.["application/json"]?.properties ?? [];
    return properties.reduce((acc, p) => {
      acc[p.name] = p.value;
      return acc;
    }, {} as Record<string, string>);
  }

  // Function definition format
  const params = (event as BedrockFunctionEvent).parameters ?? [];
  return params.reduce((acc, p) => {
    acc[p.name] = p.value;
    return acc;
  }, {} as Record<string, string>);
}

function buildApiResponse(
  event: BedrockApiEvent,
  body: string,
  statusCode: number = 200
) {
  return {
    messageVersion: "1.0",
    response: {
      actionGroup: event.actionGroup,
      apiPath: event.apiPath,
      httpMethod: event.httpMethod,
      httpStatusCode: statusCode,
      responseBody: {
        "application/json": {
          body,
        },
      },
    },
  };
}

function buildFunctionResponse(
  event: BedrockFunctionEvent,
  body: string
): BedrockAgentResponse {
  return {
    actionGroup: event.actionGroup,
    function: event.function,
    functionResponse: {
      responseBody: {
        TEXT: { body },
      },
    },
  };
}

export const handler = async (event: BedrockEvent): Promise<any> => {
  console.log("Bedrock Agent event: ", JSON.stringify(event, null, 4));

  const toolName = extractToolName(event);
  const params = extractParams(event);

  console.log(`[handler] Tool: ${toolName}`, { params });

  const toolFn = TOOL_MAP[toolName];

  if (!toolFn) {
    const error = errorResponse(
      `Unknown tool: ${toolName}. Available: ${Object.keys(TOOL_MAP).join(", ")}`
    );
    if ("apiPath" in event) {
      return buildApiResponse(event as BedrockApiEvent, error, 400);
    }
    return buildFunctionResponse(event as BedrockFunctionEvent, error);
  }

  try {
    const result = await toolFn(params);
    console.log(`[handler] Tool ${toolName} completed`, { result });

    if ("apiPath" in event) {
      return buildApiResponse(event as BedrockApiEvent, result);
    }
    return buildFunctionResponse(event as BedrockFunctionEvent, result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[handler] Tool ${toolName} threw unhandled error`, { error: message });

    const error = errorResponse(`Unhandled error in ${toolName}: ${message}`);
    if ("apiPath" in event) {
      return buildApiResponse(event as BedrockApiEvent, error, 500);
    }
    return buildFunctionResponse(event as BedrockFunctionEvent, error);
  }
};