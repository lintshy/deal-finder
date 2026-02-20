// Bedrock Agent event format
export interface BedrockParameter {
  name: string;
  type: string;
  value: string;
}

export interface BedrockAgentEvent {
  actionGroup: string;
  function: string;
  parameters: BedrockParameter[];
}

export interface BedrockAgentResponse {
  actionGroup: string;
  function: string;
  functionResponse: {
    responseBody: {
      TEXT: { body: string };
    };
  };
}

// Domain types
export interface Deal {
  id: string;
  name: string;
  category: string;
  retailer: string;
  originalPrice: number;
  salePrice: number;
  discountPct: number;
  imageUrl: string;
  productUrl: string;
}

export interface ToolParams {
  [key: string]: string;
}

export type ToolHandler = (params: ToolParams) => Promise<string>;