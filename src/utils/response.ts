import { BedrockAgentEvent, BedrockAgentResponse } from "../types";

export function buildResponse(
  event: BedrockAgentEvent,
  result: object | string
): BedrockAgentResponse {
  return {
    actionGroup: event.actionGroup,
    function: event.function,
    functionResponse: {
      responseBody: {
        TEXT: {
          body: typeof result === "string" ? result : JSON.stringify(result),
        },
      },
    },
  };
}

export function parseParams(event: BedrockAgentEvent): Record<string, string> {
  return event.parameters.reduce((acc, p) => {
    acc[p.name] = p.value;
    return acc;
  }, {} as Record<string, string>);
}

export function errorResponse(message: string): string {
  return JSON.stringify({ success: false, error: message });
}