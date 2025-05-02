import { input } from "@inquirer/prompts";
import {
  workflow,
  stopEvent,
  startEvent,
  humanInteractionEvent,
} from "../workflows/human-in-the-loop";

const name = await input({
  message: "What is your name?",
});
const { onRequest, stream, sendEvent } = workflow.createContext();

sendEvent(startEvent.with(name));

onRequest(humanInteractionEvent, async (reason) => {
  console.log("Requesting human interaction...");
  const name = await input({
    message: JSON.parse(reason).message,
  });
  console.log("Human interaction completed.");
  sendEvent(humanInteractionEvent.with(name));
});

stream.on(stopEvent, ({ data }) => {
  console.log("AI analysis: ", data);
});

await stream.until(stopEvent).toArray();
