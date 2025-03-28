import { eventSource, type Workflow, type WorkflowEventData } from "fluere";

export function readableStream<Start, Stop>(
  workflow: Workflow<Start, Stop>,
  start: Start | WorkflowEventData<Start>,
): ReadableStream<
  WorkflowEventData<Start> | WorkflowEventData<Stop> | WorkflowEventData<any>
>;
export function readableStream<Start extends void, Stop>(
  workflow: Workflow<Start, Stop>,
  start?: void,
): ReadableStream<
  WorkflowEventData<Start> | WorkflowEventData<Stop> | WorkflowEventData<any>
>;
export function readableStream<Start, Stop>(
  workflow: Workflow<Start, Stop>,
  start: Start | WorkflowEventData<Start>,
) {
  return new ReadableStream({
    start: async (controller) => {
      const { run, context, updateCallbacks } = workflow.executor;
      updateCallbacks.push((event) => {
        controller.enqueue(event);
      });
      if (eventSource(start)) {
        controller.enqueue(start);
        run([start as WorkflowEventData<Start>]);
      } else {
        const event = workflow.startEvent(start as Start);
        controller.enqueue(event);
        run([event]);
      }
      await context.requireEvent(workflow.stopEvent);
      controller.close();
    },
  });
}
