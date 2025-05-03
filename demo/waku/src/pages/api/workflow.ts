import { createServer } from "@llama-flow/http/server";
import { workflow } from "../../workflow/basic";
import { startEvent, stopEvent } from "../../workflow/events";

export const POST = createServer(
  workflow,
  (_, sendEvent) => {
    sendEvent(startEvent.with());
  },
  (stream) => stream.until(stopEvent),
);
