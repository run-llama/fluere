import { promiseHandler } from "fluere/interrupter/promise";
import { toolCallWorkflow } from "../workflows/tool-call-agent.js";

promiseHandler(
  toolCallWorkflow,
  "what is weather today, im in san francisco",
).then(({ data }) => {
  console.log("AI response", data);
});
