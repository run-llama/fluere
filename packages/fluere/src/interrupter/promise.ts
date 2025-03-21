import { readableStream, type Workflow, type WorkflowEventData } from "fluere";
import { _setHookContext } from "fluere/shared";

/**
 * Interrupter that wraps a workflow in a promise.
 *
 * Resolves when the workflow reads the stop event.
 *  reject if the workflow throws an error or times out.
 */
export async function promiseHandler<Start, Stop>(
  getExecutor: () =>
    | ReturnType<Workflow<Start, Stop>["run"]>
    | Promise<ReturnType<Workflow<Start, Stop>["run"]>>,
): Promise<WorkflowEventData<Stop>> {
  const executor = await getExecutor();
  const stream = readableStream(executor);
  for await (const event of stream) {
    if (executor.stop.include(event)) {
      return event;
    }
  }
  throw new Error("Workflow did not return a stop event");
}
