import type { WorkflowEvent, WorkflowEventData } from "fluere";
import { AsyncLocalStorage } from "node:async_hooks";
import { flattenEvents, isEventData, isPromiseLike } from "../utils";
import type { Handler, HandlerRef } from "./handler";
import { _executorAsyncLocalStorage, type Context } from "./context";

type HandlerContext = {
  handler: Handler<WorkflowEvent<any>[], any>;
  inputs: WorkflowEventData<any>[];
  outputs: WorkflowEventData<any>[];
  prev: HandlerContext;
  next: Set<HandlerContext>;
};

const handlerContextAsyncLocalStorage = new AsyncLocalStorage<HandlerContext>();

const eventContextWeakMap = new WeakMap<
  WorkflowEventData<any>,
  HandlerContext
>();

export type ExecutorParams = {
  listeners: ReadonlyMap<
    WorkflowEvent<any>[],
    Set<HandlerRef<WorkflowEvent<any>[], any>>
  >;
};

export type Executor = {
  run: (inputs: WorkflowEventData<any>[]) => void;
  updateCallbacks: ((event: WorkflowEventData<any>) => void)[];
  context: Context;
  handlerRootContext: HandlerContext;
};

export const createExecutor = ({ listeners }: ExecutorParams) => {
  const queue: WorkflowEventData<any>[] = [];
  const runHandler = (
    handler: Handler<WorkflowEvent<any>[], any>,
    inputs: WorkflowEventData<any>[],
  ) => {
    const handlerContext: HandlerContext = {
      handler,
      inputs,
      outputs: [],
      prev: handlerContextAsyncLocalStorage.getStore() ?? handlerRootContext,
      next: new Set(),
    };
    handlerContext.prev.next.add(handlerContext);
    handlerContextAsyncLocalStorage.run(handlerContext, () => {
      const result = _executorAsyncLocalStorage.run(context, () =>
        handler(...inputs),
      );
      // return value is a special event
      if (isPromiseLike(result)) {
        result.then((event) => {
          if (isEventData(event)) {
            context.sendEvent(event);
          }
        });
      } else if (isEventData(result)) {
        context.sendEvent(result);
      }
    });
  };
  const queueUpdateCallback = () => {
    const queueSnapshot = [...queue];
    [...listeners]
      .filter(([events]) => {
        const inputs = flattenEvents(events, queueSnapshot);
        return inputs.length === events.length;
      })
      .map(([events, refs]) => {
        const inputs = flattenEvents(events, queueSnapshot);
        inputs.forEach((input) => {
          queue.splice(queue.indexOf(input), 1);
        });
        for (const ref of refs) {
          runHandler(ref.handler, inputs);
        }
      });
  };
  const updateCallbacks: ((event: WorkflowEventData<any>) => void)[] = [];
  const context: Context = {
    sendEvent: (event) => {
      const context =
        handlerContextAsyncLocalStorage.getStore() ?? handlerRootContext;
      eventContextWeakMap.set(event, context);
      context.outputs.push(event);
      queue.push(event);
      updateCallbacks.forEach((cb) => cb(event));
      queueUpdateCallback();
      return {
        wait: async (conditionOrWhenOrRef: any) => {
          if (typeof conditionOrWhenOrRef === "function") {
            // when
            return new Promise<WorkflowEventData<any>>((resolve) => {
              const cb = () => {
                const event = queue.find(conditionOrWhenOrRef);
                if (event) {
                  resolve(event);
                }
                updateCallbacks.splice(updateCallbacks.indexOf(cb), 1);
              };
              updateCallbacks.push(cb);
            });
          } else if ("handler" in conditionOrWhenOrRef) {
            // ref
            const ref = conditionOrWhenOrRef as HandlerRef<
              WorkflowEvent<any>[],
              any
            >;
            return new Promise<WorkflowEventData<any>>((resolve) => {
              const cb = () => {
                const event = queue.find(
                  (q) => eventContextWeakMap.get(q)?.handler === ref.handler,
                );
                if (event) {
                  resolve(event);
                }
                updateCallbacks.splice(updateCallbacks.indexOf(cb), 1);
              };
              updateCallbacks.push(cb);
            });
          }
          throw new Error("Invalid argument for wait");
        },
      };
    },
  };

  const handlerRootContext: HandlerContext = {
    inputs: [],
    outputs: [],
    handler: null!,
    prev: null!,
    next: new Set(),
  };

  function run(inputs: WorkflowEventData<any>[]) {
    const refs = [...listeners].find(([events]) => {
      return events.every((event, i) => {
        return event.include(inputs[i]!);
      });
    })![1];
    for (const ref of refs) {
      runHandler(ref.handler, inputs);
    }
  }

  return {
    run,
    updateCallbacks,
    context,
    handlerRootContext,
  };
};
