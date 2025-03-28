import type { Context, Handler } from "hono";
import type { Workflow, WorkflowEventData } from "fluere";
import { promiseHandler } from "./promise";

export const createHonoHandler = <Start, Stop>(
  workflow: Workflow<Start, Stop>,
  getStart: (
    c: Context,
  ) =>
    | Start
    | WorkflowEventData<Start>
    | Promise<Start | WorkflowEventData<Start>>,
  wrapStopEvent?: (c: Context, stop: Stop) => Response,
): Handler => {
  if (!wrapStopEvent) {
    wrapStopEvent = (c, stop) => {
      return c.json(stop as any);
    };
  }
  return async (c) => {
    const stop = await promiseHandler(workflow, await getStart(c));
    return wrapStopEvent(c, stop.data);
  };
};
