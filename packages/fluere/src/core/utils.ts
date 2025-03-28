import type { WorkflowEvent, WorkflowEventData } from "./event";

export const isEventData = (data: unknown): data is WorkflowEventData<any> =>
  data != null && typeof data === "object" && "data" in data;

export const isPromiseLike = (value: unknown): value is PromiseLike<unknown> =>
  value != null && typeof (value as PromiseLike<unknown>).then === "function";

export function flattenEvents(
  acceptEventTypes: WorkflowEvent<any>[],
  inputEventData: WorkflowEventData<any>[],
): WorkflowEventData<any>[] {
  const acceptance: WorkflowEventData<any>[] = new Array(
    acceptEventTypes.length,
  );
  for (const eventData of inputEventData) {
    for (let i = 0; i < acceptEventTypes.length; i++) {
      if (acceptance[i]) {
        continue;
      }
      if (acceptEventTypes[i]!.include(eventData)) {
        acceptance[i] = eventData;
        break;
      }
    }
  }
  return acceptance.filter(Boolean);
}
