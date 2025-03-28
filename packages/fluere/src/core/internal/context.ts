import type { WorkflowEventData } from "fluere";
import { AsyncLocalStorage } from "node:async_hooks";
import type { HandlerRef } from "./handler";

type SendEventRequest = {
  // wait(condition?: 'all'): Promise<void>;
  wait<T, U extends T>(
    when: (event: WorkflowEventData<T>) => event is WorkflowEventData<U>,
  ): Promise<WorkflowEventData<U>>;
  wait<T>(
    ref: HandlerRef<any[], WorkflowEventData<T>>,
  ): Promise<WorkflowEventData<T>>;
};

export type Context = {
  sendEvent: (event: WorkflowEventData<any>) => SendEventRequest;
};

export const _executorAsyncLocalStorage = new AsyncLocalStorage<Context>();

export function getContext(): Context {
  const context = _executorAsyncLocalStorage.getStore();
  if (!context) {
    throw new Error("No context found");
  }
  return context;
}
