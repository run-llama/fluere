import { AsyncLocalStorage } from "node:async_hooks";
import { type Workflow, type WorkflowEventData } from "fluere";

export function withStore<T, Start, Stop>(
  store: T,
  workflow: Workflow<Start, Stop>,
): Workflow<Start, Stop> & {
  getContext: () => T;
} {
  const contextDataStorage = new AsyncLocalStorage<T>();
  return {
    ...workflow,
    getContext: (): T => {
      const store = contextDataStorage.getStore();
      if (!store) {
        throw new Error(
          "Context not found, make sure you call `workflow.run` correctly",
        );
      }
      return store;
    },
    get executor() {
      const executor = workflow.executor;
      return {
        ...executor,
        run: (inputs: WorkflowEventData<any>[]) => {
          contextDataStorage.run(store, () => executor.run(inputs));
        },
      };
    },
    get startEvent() {
      return workflow.startEvent;
    },
    get stopEvent() {
      return workflow.stopEvent;
    },
  };
}
