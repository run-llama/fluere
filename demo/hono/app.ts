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
    stopEvent,
  ),
);

const serializableMemoryMap = new Map<string, any>();

app.post("/human-in-the-loop", async (ctx) => {
  const { workflow, stopEvent, startEvent, humanInteractionEvent } =
    await import("../workflows/human-in-the-loop");
  const json = await ctx.req.json();
  let context: ReturnType<typeof workflow.createContext>;
  if (json.requestId) {
    const data = json.data;
    const serializable = serializableMemoryMap.get(json.requestId);
    context = workflow.resume(data, serializable);
  } else {
    context = workflow.createContext();
    context.sendEvent(startEvent.with(json.data));
  }

  const { onRequest, stream } = context;
  return new Promise<Response>((resolve) => {
    // listen to human interaction
    onRequest(humanInteractionEvent, async (reason) => {
      context.snapshot().then(([re, sd]) => {
        const requestId = crypto.randomUUID();
        serializableMemoryMap.set(requestId, sd);
        resolve(
          Response.json({
            requestId: requestId,
            reason: reason,
            data: re.map((r) =>
              r === humanInteractionEvent
                ? "request human in the loop"
                : "UNKNOWN",
            ),
          }),
        );
      });
    });

    // consume stream
    stream
      .until(stopEvent)
      .toArray()
      .then((events) => {
        const stopEvent = events.at(-1)!;
        resolve(Response.json(stopEvent.data));
      });
  });
});

serve(app, ({ port }) => {
  console.log(`Server started at http://localhost:${port}`);
});
