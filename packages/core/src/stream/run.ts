import type {
  WorkflowEvent,
  WorkflowEventData,
  Workflow,
} from "@llama-flow/core";
import { collect } from "./consumer";
import { until } from "./until";

/**
 * Runs a workflow with a specified input event and returns the first matching event of the specified output type.
 *
 * @example
 * ```ts
 * const result = await runWorkflow(workflow, startEvent.with("42"), stopEvent);
 * console.log(`Result: ${result.data === 1 ? 'positive' : 'negative'}`);
 * ```
 */
export async function runWorkflow<Input, Output>(
  workflow: Workflow,
  inputEvent: WorkflowEventData<Input>,
  outputEvent: WorkflowEvent<Output>,
): Promise<WorkflowEventData<Output>> {
  const { stream, sendEvent } = workflow.createContext();

  // Send the initial event
  sendEvent(inputEvent);

  // Create a stream until we get the output event
  const untilStream = until(stream, outputEvent);

  // Find the first matching event
  for await (const event of untilStream) {
    if (outputEvent.include(event)) {
      return event as WorkflowEventData<Output>;
    }
  }

  throw new Error(`No matching ${outputEvent.toString()} event found`);
}

/**
 * Runs a workflow with a specified input event and collects all events until a specified output event is encountered.
 * Returns an array containing all events including the final output event.
 *
 * @example
 * ```ts
 * const allEvents = await runAndCollect(workflow, startEvent.with("42"), stopEvent);
 * const finalEvent = allEvents[allEvents.length - 1];
 * console.log(`Result: ${finalEvent.data === 1 ? 'positive' : 'negative'}`);
 * ```
 */
export async function runAndCollect<Input, Output>(
  workflow: Workflow,
  inputEvent: WorkflowEventData<Input>,
  outputEvent: WorkflowEvent<Output>,
): Promise<WorkflowEventData<any>[]> {
  const { stream, sendEvent } = workflow.createContext();

  // Send the initial event
  sendEvent(inputEvent);

  // Collect all events until the output event
  return await collect(until(stream, outputEvent));
}

/**
 * Runs a workflow with a specified input event and returns an async iterable stream of all events
 * until a specified output event is encountered.
 *
 * This allows processing events one by one without collecting them all upfront.
 *
 * @example
 * ```ts
 * const eventStream = runStream(workflow, startEvent.with("42"), stopEvent);
 * for await (const event of eventStream) {
 *   console.log(`Processing event: ${event}`);
 *   // Do something with each event as it arrives
 * }
 * ```
 */
export function runStream<Input, Output>(
  workflow: Workflow,
  inputEvent: WorkflowEventData<Input>,
  outputEvent: WorkflowEvent<Output>,
): AsyncIterable<WorkflowEventData<any>> {
  const { stream, sendEvent } = workflow.createContext();

  // Send the initial event
  sendEvent(inputEvent);

  // Return the stream that runs until the output event is encountered
  return until(stream, outputEvent);
}
