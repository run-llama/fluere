import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { createHonoHandler } from "@llama-flow/core/hono";
import {
  toolCallWorkflow,
  startEvent,
  stopEvent,
} from "../workflows/tool-call-agent.js";

const app = new Hono();

app.post(
  "/workflow",
  createHonoHandler(
    toolCallWorkflow,
    async (ctx) => startEvent.with(await ctx.req.text()),
    stopEvent
  )
);

export const serializableMemoryMap = new Map<string, any>();

app.post("/human-in-the-loop", async (ctx) => {
  const {
    workflow,
    stopEvent,
    startEvent,
    humanInteractionRequestEvent,
    humanInteractionResponseEvent,
  } = await import("../workflows/human-in-the-loop");

  const json = await ctx.req.json();
  let context: ReturnType<typeof workflow.createContext>;
  if (json.requestId) {
    const serializable = serializableMemoryMap.get(json.requestId);
    context = workflow.resume(serializable);
    context.sendEvent(humanInteractionResponseEvent.with(json.data));
    // Note: we are implying here knowledge of the workflow (that we need to continue
    // with a humanInteractionResponseEvent), we could alternatively add the next event, when we create the snapshot:
    // const snapshot = await getContext().snapshot(humanInteractionResponseEvent);
    // and then pass just the data with resume:
    // context = workflow.resume(json.data, serializable);
    // I think the current version is better as it simplifies the design
  } else {
    context = workflow.createContext();
    context.sendEvent(startEvent.with(json.data));
  }

  const { stream } = context;
  return new Promise<Response>(async (resolve) => {
    // consume stream
    for await (const event of stream) {
      if (humanInteractionRequestEvent.include(event)) {
        // request for a human, serialize the workflow for later resume
        const requestId = crypto.randomUUID();
        serializableMemoryMap.set(requestId, event.data.snapshot);
        // send request id to user
        resolve(
          Response.json({
            requestId: requestId,
            reason: event.data.reason,
            data: "request human in the loop",
          })
        );
      }
      if (stopEvent.include(event)) {
        resolve(Response.json(event.data));
      }
    }
  });
});

serve(app, ({ port }) => {
  console.log(`Server started at http://localhost:${port}`);
});
