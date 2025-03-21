import type { Context, Handler } from "hono";
import type { Workflow } from "fluere";
import { promiseHandler } from "./promise";

export const createHonoHandler = <Start, Stop>(
  getExecutor: (
    c: Context,
  ) =>
    | Promise<ReturnType<Workflow<Start, Stop>["run"]>>
    | ReturnType<Workflow<Start, Stop>["run"]>,
  wrapStopEvent?: (c: Context, stop: Stop) => Response,
): Handler => {
  if (!wrapStopEvent) {
    wrapStopEvent = (c, stop) => {
      return c.json(stop as any);
    };
  }
  return async (c) => {
    const stop = await promiseHandler(() => getExecutor(c));
    return wrapStopEvent(c, stop.data);
  };
};
