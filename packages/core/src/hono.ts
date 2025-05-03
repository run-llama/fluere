import type { Context, Handler } from "hono";
import type {
  Workflow,
  WorkflowEvent,
  WorkflowEventData,
} from "@llama-flow/core";
import { run } from "./stream/run";

export const createHonoHandler = <Start, Stop>(
  workflow: Workflow,
  getStart: (
    c: Context,
  ) => WorkflowEventData<Start> | Promise<WorkflowEventData<Start>>,
  stopEvent: WorkflowEvent<Stop>,
  wrapStopEvent?: (c: Context, stop: Stop) => Response,
): Handler => {
  if (!wrapStopEvent) {
    wrapStopEvent = (c, stop) => {
      return c.json(stop as any);
    };
  }
  return async (c) => {
    const results = await run(workflow, await getStart(c))
      .until(stopEvent)
      .toArray();
    return wrapStopEvent(c, results.at(-1)!.data);
  };
};
