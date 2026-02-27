import { BedrockFunctionEvent, handler } from "../src/handler";

// Pick which event to run via command line arg: npx ts-node test/runLocal.ts fetchPage
const toolName = process.argv[2] ?? "fetchPage";

async function run() {
  let event: BedrockFunctionEvent

  try {
    event = require(`./events/${toolName}.json`);
  } catch {
    console.error(`No test event found for "${toolName}".`);
    console.error("Available: fetchPage, parseDeals, saveDeals");
    process.exit(1);
  }

  console.log(`\n🚀 Running tool: ${event.function}`);
  console.log("─".repeat(50));

  const response = await handler(event);

  console.log("\n✅ Raw Bedrock Response:");
  console.log(JSON.stringify(response, null, 2));

  // Also pretty-print the actual tool output
  const body = response.functionResponse.responseBody.TEXT.body;
  console.log("\n📦 Tool Output (parsed):");
  try {
    console.log(JSON.stringify(JSON.parse(body), null, 2));
  } catch {
    console.log(body);
  }
}

run().catch(console.error);