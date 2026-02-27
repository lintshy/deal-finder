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

// Standard shape returned by fetch_page — one entry per product on the page.
// originalPrice/salePrice are null when the page doesn't expose both prices.
export interface FetchedProduct {
  name: string;
  category: string;
  originalPrice: number | null;
  salePrice: number | null;
  currency: string;
  imageUrl: string;
  productUrl: string;
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