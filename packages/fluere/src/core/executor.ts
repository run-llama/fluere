import type { WorkflowEvent, WorkflowEventData } from "./event";
import { _getHookContext } from "fluere/shared";
import { AsyncLocalStorage } from "node:async_hooks";
import { flattenEvents, isEventData, isPromiseLike } from "./utils";

export type Handler<
  AcceptEvents extends WorkflowEvent<any>[],
  Result extends WorkflowEventData<any> | void,
> = (
  ...event: {
    [K in keyof AcceptEvents]: ReturnType<AcceptEvents[K]>;
  }
) => Result | Promise<Result>;

export type ReadonlyHandlerMap = ReadonlyMap<
  WorkflowEvent<any>[],
  Set<Handler<WorkflowEvent<any>[], any>>
>;

export type ExecutorParams<Start, Stop> = {
  start: WorkflowEvent<Start>;
  stop: WorkflowEvent<Stop>;
  initialEvent: WorkflowEventData<Start>;
  steps: ReadonlyHandlerMap;
};

export type ExecutorContext = {
  requireEvent: <Data>(
    event: WorkflowEvent<Data>,
  ) => Promise<WorkflowEventData<Data>>;
  sendEvent: <Data>(event: WorkflowEventData<Data>) => void;

  __dev__reference: {
    next: WeakMap<WorkflowEventData<any>, WorkflowEventData<any>>;
    prev: WeakMap<WorkflowEventData<any>, WorkflowEventData<any>>;
  };
};

export type ExecutorResponse =
  | {
      type: "start";
      data: WorkflowEventData<any>;
    }
  | {
      type: "running";
      data: (
        | Promise<WorkflowEventData<any> | void>
        | WorkflowEventData<any>
        | void
      )[];
      squeeze: (eventData: WorkflowEventData<any>) => void;
    }
  | {
      type: "send";
      data: WorkflowEventData<any>[];
      deplete: WorkflowEventData<any>[];
      execute: (eventData: WorkflowEventData<any>) => void;
    }
  | {
      type: "empty";
      squeeze: (eventData: WorkflowEventData<any>) => void;
    };

export class EventDataNotExistError extends Error {}

export type Executor<Start, Stop> = {
  get start(): WorkflowEvent<Start>;
  get stop(): WorkflowEvent<Stop>;
  [Symbol.iterator]: () => IterableIterator<ExecutorResponse>;
};

type InternalExecutorContext = ExecutorContext & {
  prev: null | InternalExecutorContext;
  next: Set<InternalExecutorContext>;
  __internal__waitEvent: ((event: WorkflowEvent<any>) => Promise<void>) | null;
  __internal__currentInputs: WorkflowEventData<any>[];
  __internal__currentEvents: WorkflowEventData<any>[];
  __internal__result_counter_map: WeakMap<
    WorkflowEventData<any> | Promise<WorkflowEventData<any> | void>,
    number
  >;
  __internal__result_counter: number;
};

const executorContextAsyncLocalStorage =
  new AsyncLocalStorage<InternalExecutorContext>();

function _internal_getContext(
  rootContext: InternalExecutorContext,
): InternalExecutorContext {
  return executorContextAsyncLocalStorage.getStore() ?? rootContext;
}

function _internal_setContext<R>(
  context: InternalExecutorContext,
  fn: () => R,
): R {
  const prev = context.prev;
  if (prev) {
    prev.next.add(context);
  }
  return executorContextAsyncLocalStorage.run(context, fn);
}

export function getContext(): ExecutorContext {
  const store = executorContextAsyncLocalStorage.getStore();
  if (!store) {
    throw new Error("No context available");
  }
  return {
    sendEvent: store.sendEvent,
    requireEvent: store.requireEvent,
    __dev__reference: store.__dev__reference,
  };
}

export function createExecutor<Start, Stop>(
  params: ExecutorParams<Start, Stop>,
): Executor<Start, Stop> {
  const { start, steps, stop } = params;
  //#region Data
  /**
   * The queue of events to be processed
   */
  const queue: WorkflowEventData<any>[] = [];
  /**
   * The set of event promises that are currently running
   */
  const runningEvents: Set<
    Promise<WorkflowEventData<any> | void> | WorkflowEventData<any>
  > = new Set<Promise<WorkflowEventData<any> | void>>();
  /**
   * Whether the event has been sent to the controller
   */
  const enqueuedEvents: Set<WorkflowEventData<any>> = new Set<
    WorkflowEventData<any>
  >();
  //#endregion

  //#region User Side API
  function sendEvent(eventData: WorkflowEventData<any>) {
    // todo: should throw error when eventData sent multiple times
    const {
      __internal__currentEvents,
      __internal__currentInputs,
      __dev__reference: { next, prev },
    } = _internal_getContext(rootExecutorContext);
    __internal__currentInputs.forEach((input) => {
      next.set(input, eventData);
      prev.set(eventData, input);
    });
    __internal__currentEvents.push(eventData);
  }
  async function requireEvent<Data>(
    event: WorkflowEvent<Data>,
  ): Promise<WorkflowEventData<Data>> {
    while (true) {
      const acceptableInput = queue.find((eventData) =>
        event.include(eventData),
      );
      if (acceptableInput) {
        let current = acceptableInput;
        while (current) {
          const store = executorContextAsyncLocalStorage.getStore()!;
          const prevWeakMap = store.__dev__reference.prev;
          const acceptableEvents = [
            ...store.__internal__currentInputs,
            ...store.__internal__currentEvents,
          ];
          while (prevWeakMap.get(current) !== undefined) {
            const inSameContext = acceptableEvents.some(
              (input) => current === input,
            );
            if (inSameContext) {
              return acceptableInput;
            }
            current = prevWeakMap.get(current)!;
          }
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  //#endregion

  //#region Context
  const rootExecutorContext: InternalExecutorContext = {
    requireEvent,
    sendEvent,
    __dev__reference: {
      next: new WeakMap<WorkflowEventData<any>, WorkflowEventData<any>>(),
      prev: new WeakMap<WorkflowEventData<any>, WorkflowEventData<any>>(),
    },
    __internal__waitEvent: null,
    __internal__result_counter: 0,
    __internal__result_counter_map: new WeakMap(),
    __internal__currentInputs: [] as WorkflowEventData<any>[],
    __internal__currentEvents: [] as WorkflowEventData<any>[],

    prev: null,
    next: new Set(),
  };
  //#endregion

  //#region Cache
  const stepCache: WeakMap<
    WorkflowEventData<any>,
    [
      Set<Handler<WorkflowEvent<any>[], WorkflowEventData<any>>>,
      WeakMap<
        Handler<WorkflowEvent<any>[], WorkflowEventData<any>>,
        WorkflowEvent<any>[]
      >,
      WeakMap<
        Handler<WorkflowEvent<any>[], WorkflowEventData<any>>,
        WorkflowEvent<any>[]
      >,
    ]
  > = new WeakMap();
  //#endregion

  function getStepFunction(
    eventData: WorkflowEventData<any>,
  ): [
    Set<Handler<WorkflowEvent<any>[], WorkflowEventData<any>>>,
    WeakMap<
      Handler<WorkflowEvent<any>[], WorkflowEventData<any>>,
      WorkflowEvent<any>[]
    >,
    WeakMap<
      Handler<WorkflowEvent<any>[], WorkflowEventData<any>>,
      WorkflowEvent<any>[]
    >,
  ] {
    if (stepCache.has(eventData)) {
      return stepCache.get(eventData)!;
    }
    const set = new Set<
      Handler<WorkflowEvent<any>[], WorkflowEventData<any>>
    >();
    const stepInputs = new WeakMap<
      Handler<WorkflowEvent<any>[], WorkflowEventData<any>>,
      WorkflowEvent<any>[]
    >();
    const stepOutputs = new WeakMap<
      Handler<WorkflowEvent<any>[], WorkflowEventData<any>>,
      WorkflowEvent<any>[]
    >();
    const res: [
      Set<Handler<WorkflowEvent<any>[], WorkflowEventData<any>>>,
      WeakMap<
        Handler<WorkflowEvent<any>[], WorkflowEventData<any>>,
        WorkflowEvent<any>[]
      >,
      WeakMap<
        Handler<WorkflowEvent<any>[], WorkflowEventData<any>>,
        WorkflowEvent<any>[]
      >,
    ] = [set, stepInputs, stepOutputs];
    stepCache.set(eventData, res);
    for (const [inputs, handlers] of steps) {
      if ([...inputs].some((input) => input.include(eventData))) {
        for (const handler of handlers) {
          set.add(handler);
          stepInputs.set(handler, inputs);
        }
      }
    }
    return res;
  }

  const handleEventData = (
    currentEventData: WorkflowEventData<any>,
  ): [
    nextStepEvents:
      | Promise<WorkflowEventData<any> | void>
      | WorkflowEventData<any>
      | void,
    nextStepSendEvents: WorkflowEventData<any>[],
    nextStep: WorkflowEventData<any>[],
  ][] => {
    const [handlerSet, inputsMap] = getStepFunction(currentEventData);
    return [...handlerSet.values()].flatMap((nextStep) => {
      const inputs = inputsMap.get(nextStep) ?? [];
      // todo: edge case when inputs.length === 0
      const acceptableEventData = queue
        .filter((q): q is WorkflowEventData<any> =>
          inputs.some((input) => input.include(q)),
        )
        .map((q) => q);
      const allPossibleInputs = [
        ...new Set([currentEventData, ...acceptableEventData]),
      ];
      const results: [
        result:
          | Promise<WorkflowEventData<any | void>>
          | WorkflowEventData<any>
          | void,
        currentEvents: WorkflowEventData<any>[],
        args: WorkflowEventData<any>[],
      ][] = [];
      while (allPossibleInputs.length > 0) {
        const events = flattenEvents(inputs, allPossibleInputs);
        if (events.length !== inputs.length) {
          _getHookContext()?.__dev__onMismatchEvents(nextStep, ...events);
          queue.push(currentEventData);
          break;
        } else {
          // remove from queue
          events.forEach((e) => {
            const idx = queue.findIndex((p) => p === e);
            if (idx !== -1) queue.splice(idx, 1);
          });
          // remove acceptable inputs from queue
          allPossibleInputs
            .filter((e) => events.some((p) => p === e))
            .forEach((e) => {
              const idx = queue.findIndex((q) => q === e);
              if (idx !== -1) queue.splice(idx, 1);
            });
        }

        // call many step as much as possible
        const args = events.sort((a, b) => {
          const aIndex = inputs.findIndex((i) => i.include(a));
          const bIndex = inputs.findIndex((i) => i.include(b));
          return aIndex - bIndex;
        });
        _getHookContext()?.beforeEvents(nextStep, ...args);
        const currentEvents: WorkflowEventData<any>[] = [];
        const context: InternalExecutorContext = {
          prev: executorContextAsyncLocalStorage.getStore() ?? null,
          next: new Set(),
          __internal__currentInputs: args,
          __internal__currentEvents: currentEvents,
          // keep the same
          __dev__reference: rootExecutorContext.__dev__reference,
          __internal__waitEvent: null,
          __internal__result_counter:
            rootExecutorContext.__internal__result_counter,
          __internal__result_counter_map:
            rootExecutorContext.__internal__result_counter_map,
          sendEvent: rootExecutorContext.sendEvent,
          requireEvent: rootExecutorContext.requireEvent,
        };
        const result = _internal_setContext(context, () => nextStep(...args));
        args.forEach((arg) => {
          const idx = allPossibleInputs.findIndex((p) => arg === p);
          if (idx !== -1) allPossibleInputs.splice(idx, 1);
        });
        results.push([result, currentEvents, args]);
      }

      results.forEach(([result, _, args]) => {
        const counter = rootExecutorContext.__internal__result_counter;
        if (isPromiseLike(result)) {
          rootExecutorContext.__internal__result_counter_map.set(
            result,
            counter,
          );
          return result.then((nextEvent: void | WorkflowEventData<any>) => {
            if (!nextEvent) return;
            _getHookContext()?.afterEvents(nextStep, ...args);
            args.forEach((arg) => {
              rootExecutorContext.__dev__reference.next.set(arg, nextEvent);
              rootExecutorContext.__dev__reference.prev.set(nextEvent, arg);
            });
            return nextEvent;
          });
        } else if (isEventData(result)) {
          rootExecutorContext.__internal__result_counter_map.set(
            result,
            counter,
          );
          _getHookContext()?.afterEvents(nextStep, ...args);
          args.forEach((arg) => {
            rootExecutorContext.__dev__reference.next.set(arg, result);
            rootExecutorContext.__dev__reference.prev.set(result, arg);
          });
          return result;
        } else {
          return;
        }
      });

      rootExecutorContext.__internal__result_counter++;

      return results;
    });
  };

  function squeeze(eventData: WorkflowEventData<any>) {
    queue.push(eventData);
  }

  function* queueIterator(): IterableIterator<ExecutorResponse> {
    while (true) {
      const currentEventData = queue.shift();

      if (currentEventData) {
        if (!enqueuedEvents.has(currentEventData)) {
          yield {
            type: "start",
            data: currentEventData,
          };
          enqueuedEvents.add(currentEventData);
        }
        const nextStepEvents: (
          | Promise<WorkflowEventData<any> | void>
          | WorkflowEventData<any>
        )[] = [];
        let currentEventDataInLoop = [currentEventData];
        let nextStepResults = [] as [
          nextStepEvents:
            | Promise<WorkflowEventData<any> | void>
            | WorkflowEventData<any>
            | void,
          nextStepSendEvents: WorkflowEventData<any>[],
          nextStepArgs: WorkflowEventData<any>[],
        ][];
        while (true) {
          while (currentEventDataInLoop.length > 0) {
            const currentEventData = currentEventDataInLoop.shift()!;
            if (!enqueuedEvents.has(currentEventData)) {
              yield {
                type: "start",
                data: currentEventData,
              };
              enqueuedEvents.add(currentEventData);
            }
            const context: InternalExecutorContext = {
              prev: _internal_getContext(rootExecutorContext).prev,
              next: _internal_getContext(rootExecutorContext).next,
              __internal__currentInputs:
                _internal_getContext(rootExecutorContext)
                  .__internal__currentInputs,
              __internal__currentEvents:
                _internal_getContext(rootExecutorContext)
                  .__internal__currentEvents,
              // keep the same
              __dev__reference: rootExecutorContext.__dev__reference,
              __internal__waitEvent: null,
              __internal__result_counter:
                rootExecutorContext.__internal__result_counter,
              __internal__result_counter_map:
                rootExecutorContext.__internal__result_counter_map,
              sendEvent: rootExecutorContext.sendEvent,
              requireEvent: rootExecutorContext.requireEvent,
            };

            nextStepResults.push(
              ..._internal_setContext(context, () =>
                handleEventData(currentEventData),
              ),
            );
          }
          nextStepEvents.push(...nextStepResults.map((r) => r[0]!));
          const nextStepSendEvents = nextStepResults.flatMap((r) => r[1]!);
          nextStepResults
            .map((r) => r[0]!)
            .forEach((ev) => {
              if (isPromiseLike(ev)) {
                runningEvents.add(ev);
                ev.finally(() => {
                  runningEvents.delete(ev);
                });
              }
            });
          let executed = false;
          const deplete = nextStepResults
            .flatMap((r) => r[2]!)
            .filter((e) => !enqueuedEvents.has(e));
          yield {
            type: "send",
            data: nextStepSendEvents,
            deplete,
            execute: (eventData) => {
              if (!executed) {
                executed = true;
                currentEventDataInLoop = [];
                nextStepResults = [];
              }
              currentEventDataInLoop.push(eventData);
            },
          };
          deplete.forEach((d) => enqueuedEvents.add(d));
          if (!executed) {
            queue.push(...nextStepSendEvents);
            break;
          }
        }
        const orderMap = rootExecutorContext.__internal__result_counter_map;
        yield {
          type: "running",
          data: nextStepEvents.sort((a, b) => {
            const aCounter = orderMap.get(a)!;
            const bCounter = orderMap.get(b)!;
            return bCounter - aCounter;
          }),
          squeeze,
        };
      } else {
        function fallbackFoundMissing(executor: InternalExecutorContext) {
          const events = executor.__internal__currentEvents;
          events.forEach((ev) => {
            if (!enqueuedEvents.has(ev)) {
              // todo: should warn user?
              queue.push(ev);
            }
          });
          for (const next of executor.next) {
            fallbackFoundMissing(next);
          }
        }
        fallbackFoundMissing(rootExecutorContext);
        if (queue.length === 0) {
          yield {
            type: "empty",
            squeeze,
          };
        }
      }
    }
  }

  return {
    get start() {
      return start;
    },
    get stop() {
      return stop;
    },
    [Symbol.iterator]: function handleQueue() {
      if (!("snapshot" in params)) {
        queue.push(params.initialEvent);
      }
      return queueIterator();
    },
  };
}
