// DO NOT IMPORT ASYNC-LOCAL-STORAGE DIRECTLY
import type { AsyncLocalStorage as NodeAsyncLocalStorage } from "async_hooks";

declare global {
  var AsyncLocalStorage: typeof NodeAsyncLocalStorage;
}

import type { WorkflowEvent, WorkflowEventInstance } from "./event";

export type Handler<
  AcceptEvents extends WorkflowEvent<any>[],
  Result extends WorkflowEventInstance<any> | void,
> = (
  ...event: {
    [K in keyof AcceptEvents]: ReturnType<AcceptEvents[K]>;
  }
) => Result | Promise<Result>;

export type ReadonlyHandlerMap = ReadonlyMap<
  WorkflowEvent<any>[],
  Set<Handler<WorkflowEvent<any>[], any>>
>;

export type Wait = () => Promise<void>;

export type ExecutorParams<Start, Stop> = {
  start: WorkflowEvent<Start>;
  stop: WorkflowEvent<Stop>;
  initialEvent: WorkflowEventInstance<Start>;
  steps: ReadonlyHandlerMap;
  timeout: number | null;
  verbose: boolean;
  beforeDone: Wait;
};

type ExecutorContext = {
  requireEvent: <Data>(
    event: WorkflowEvent<Data>,
  ) => Promise<WorkflowEventInstance<Data>>;
  sendEvent: <Data>(event: WorkflowEventInstance<Data>) => void;
};

type EventProtocol = {
  type: "event";
  instance: WorkflowEventInstance<any>;
};

export type QueueProtocol =
  | EventProtocol
  | { type: "requestEvent"; id: string; requestEvent: WorkflowEvent<any> };

function flattenEvents(
  acceptEventTypes: WorkflowEvent<any>[],
  inputEventInstances: WorkflowEventInstance<any>[],
): WorkflowEventInstance<any>[] {
  const acceptance = new Set<WorkflowEventInstance<any>>();
  for (const eventInstance of inputEventInstances) {
    for (const acceptType of acceptEventTypes) {
      if (
        eventInstance.event === acceptType &&
        !acceptance.has(eventInstance)
      ) {
        acceptance.add(eventInstance);
        break;
      }
    }
  }
  return [...acceptance];
}

const executorContextAsyncLocalStorage =
  new AsyncLocalStorage<ExecutorContext>();

export function getExecutorContext(): ExecutorContext {
  const context = executorContextAsyncLocalStorage.getStore();
  if (!context)
    throw new Error(
      "Executor context not found, make sure you are running inside an executor",
    );
  return context;
}

export type Executor<Start, Stop> = {
  [Symbol.asyncIterator]: () => AsyncIterableIterator<
    | WorkflowEventInstance<any>
    | WorkflowEventInstance<Start>
    | WorkflowEventInstance<Stop>
  >;
};

export function createExecutor<Start, Stop>(
  params: ExecutorParams<Start, Stop>,
): Executor<Start, Stop> {
  const { steps, initialEvent, beforeDone, verbose, stop } = params;
  const queue: QueueProtocol[] = [];
  const queueEventTarget = new EventTarget();
  let pendingInputQueue: WorkflowEventInstance<any>[] = [];

  const stepCache: WeakMap<
    WorkflowEventInstance<any>,
    [
      Set<Handler<WorkflowEvent<any>[], WorkflowEventInstance<any>>>,
      WeakMap<
        Handler<WorkflowEvent<any>[], WorkflowEventInstance<any>>,
        WorkflowEvent<any>[]
      >,
      WeakMap<
        Handler<WorkflowEvent<any>[], WorkflowEventInstance<any>>,
        WorkflowEvent<any>[]
      >,
    ]
  > = new WeakMap();

  function getStepFunction(
    eventInstance: WorkflowEventInstance<any>,
  ): [
    Set<Handler<WorkflowEvent<any>[], WorkflowEventInstance<any>>>,
    WeakMap<
      Handler<WorkflowEvent<any>[], WorkflowEventInstance<any>>,
      WorkflowEvent<any>[]
    >,
    WeakMap<
      Handler<WorkflowEvent<any>[], WorkflowEventInstance<any>>,
      WorkflowEvent<any>[]
    >,
  ] {
    if (stepCache.has(eventInstance)) {
      return stepCache.get(eventInstance)!;
    }
    const set = new Set<
      Handler<WorkflowEvent<any>[], WorkflowEventInstance<any>>
    >();
    const stepInputs = new WeakMap<
      Handler<WorkflowEvent<any>[], WorkflowEventInstance<any>>,
      WorkflowEvent<any>[]
    >();
    const stepOutputs = new WeakMap<
      Handler<WorkflowEvent<any>[], WorkflowEventInstance<any>>,
      WorkflowEvent<any>[]
    >();
    const res: [
      Set<Handler<WorkflowEvent<any>[], WorkflowEventInstance<any>>>,
      WeakMap<
        Handler<WorkflowEvent<any>[], WorkflowEventInstance<any>>,
        WorkflowEvent<any>[]
      >,
      WeakMap<
        Handler<WorkflowEvent<any>[], WorkflowEventInstance<any>>,
        WorkflowEvent<any>[]
      >,
    ] = [set, stepInputs, stepOutputs];
    stepCache.set(eventInstance, res);
    for (const [inputs, handlers] of steps) {
      if ([...inputs].some((input) => input === eventInstance.event)) {
        for (const handler of handlers) {
          set.add(handler);
          stepInputs.set(handler, inputs);
        }
      }
    }
    return res;
  }

  sendEvent(initialEvent);

  function sendEvent(event: WorkflowEventInstance<any>): void {
    queue.push({ type: "event", instance: event });
  }

  async function requireEvent<Data>(
    event: WorkflowEvent<Data>,
  ): Promise<WorkflowEventInstance<Data>> {
    const requestId = crypto.randomUUID();
    queue.push({ type: "requestEvent", id: requestId, requestEvent: event });
    return new Promise((resolve) => {
      const handler = (e: Event) => {
        if (e instanceof CustomEvent && e.detail.id === requestId) {
          queueEventTarget.removeEventListener("update", handler);
          resolve(e.detail.event);
        }
      };
      queueEventTarget.addEventListener("update", handler);
    });
  }

  const executorContext: ExecutorContext = {
    requireEvent,
    sendEvent,
  };

  function createStreamEvents(): AsyncIterableIterator<
    WorkflowEventInstance<any>
  > {
    const isPendingEvents = new WeakSet<WorkflowEventInstance<any>>();
    const pendingTasks = new Set<Promise<WorkflowEventInstance<any> | void>>();
    const enqueuedEvents = new Set<WorkflowEventInstance<any>>();
    const stream = new ReadableStream<WorkflowEventInstance<any>>({
      start: async (controller) => {
        while (true) {
          const eventProtocol = queue.shift();
          if (eventProtocol) {
            switch (eventProtocol.type) {
              case "requestEvent": {
                const { id, requestEvent } = eventProtocol;
                const acceptableInput = pendingInputQueue.find(
                  (eventInstance) => eventInstance.event === requestEvent,
                );
                if (acceptableInput) {
                  const protocolIdx = queue.findIndex(
                    (p) => p.type === "event" && p.instance === acceptableInput,
                  );
                  if (protocolIdx !== -1) queue.splice(protocolIdx, 1);
                  pendingInputQueue.splice(
                    pendingInputQueue.indexOf(acceptableInput),
                    1,
                  );
                  queueEventTarget.dispatchEvent(
                    new CustomEvent("update", {
                      detail: { id, event: acceptableInput },
                    }),
                  );
                } else {
                  queue.push(eventProtocol);
                }
                break;
              }
              case "event": {
                const { instance } = eventProtocol;
                if (isPendingEvents.has(instance)) {
                  sendEvent(instance);
                } else {
                  if (!enqueuedEvents.has(instance)) {
                    controller.enqueue(instance);
                    enqueuedEvents.add(instance);
                  }
                  // todo: outputsMap diagnostics
                  const [steps, inputsMap, _outputsMap] =
                    getStepFunction(instance);
                  const nextEventPromises = [...steps].map((step) => {
                    const inputs = inputsMap.get(step) ?? [];
                    const acceptableInputs = pendingInputQueue.filter((e) =>
                      inputs.some((input) => e.event === input),
                    );
                    const acceptableInputsFromQueue = queue
                      .filter(
                        (q): q is EventProtocol =>
                          q.type === "event" &&
                          inputs.some((input) => q.instance.event === input),
                      )
                      .map((q) => q.instance);

                    const events = flattenEvents(inputs, [
                      instance,
                      ...acceptableInputs,
                      ...acceptableInputsFromQueue,
                    ]);
                    events.forEach((e) => {
                      const idx = queue.findIndex(
                        (p) => p.type === "event" && p.instance === e,
                      );
                      if (idx !== -1) queue.splice(idx, 1);
                    });
                    if (events.length !== inputs.length) {
                      if (verbose) {
                        console.log(`Not enough inputs for step ${step.name}`);
                      }
                      sendEvent(instance);
                      isPendingEvents.add(instance);
                      return null;
                    } else {
                      // remove acceptable inputs from pending queue
                      acceptableInputs.forEach((e) => {
                        const idx = pendingInputQueue.indexOf(e);
                        if (idx !== -1) pendingInputQueue.splice(idx, 1);
                      });
                      // remove acceptable inputs from queue
                      acceptableInputsFromQueue.forEach((e) => {
                        const idx = queue.findIndex(
                          (q) => q.type === "event" && q.instance === e,
                        );
                        if (idx !== -1) queue.splice(idx, 1);
                      });
                    }
                    if (isPendingEvents.has(instance))
                      isPendingEvents.delete(instance);
                    if (verbose)
                      console.log(
                        `Running step ${step.name} with inputs ${events
                          .map((ev) => ev.event)
                          .join(",")}`,
                      );
                    const result = step(
                      ...events.sort((a, b) => {
                        const aIndex = inputs.findIndex((i) => a.event === i);
                        const bIndex = inputs.findIndex((i) => b.event === i);
                        return aIndex - bIndex;
                      }),
                    );
                    if (result && "then" in result) {
                      return result.then(
                        (nextEvent: void | WorkflowEventInstance<any>) => {
                          if (!nextEvent) return;
                          if (verbose)
                            console.log(
                              `Step ${step.name} completed: ${nextEvent.event}`,
                            );
                          if (nextEvent.event !== stop) {
                            pendingInputQueue.unshift(nextEvent);
                            sendEvent(nextEvent);
                          }
                          return nextEvent;
                        },
                      );
                    } else if (result && "data" in result) {
                      if (verbose)
                        console.log(
                          `Step ${step.name} completed: ${result.event}`,
                        );
                      if (result.event !== stop) {
                        pendingInputQueue.unshift(result);
                        sendEvent(result);
                      }
                      return result;
                    }
                    return;
                  });
                  nextEventPromises.forEach((p) => {
                    if (p && "then" in p) {
                      pendingTasks.add(p);
                      p.catch((err) =>
                        console.error("Error in step", err),
                      ).finally(() => pendingTasks.delete(p));
                    }
                  });
                  if (nextEventPromises.some((p) => p && "data" in p)) {
                    const fastest = nextEventPromises.find(
                      (p): p is WorkflowEventInstance<any> =>
                        !!p && "data" in p,
                    );
                    if (fastest && !enqueuedEvents.has(fastest)) {
                      controller.enqueue(fastest);
                      enqueuedEvents.add(fastest);
                    }
                  }
                  await Promise.race(nextEventPromises)
                    .then((fastest) => {
                      if (!fastest || enqueuedEvents.has(fastest)) return null;
                      controller.enqueue(fastest);
                      enqueuedEvents.add(fastest);
                      return fastest;
                    })
                    .then(async (fastest) => {
                      const nextEvents = (
                        await Promise.all(nextEventPromises)
                      ).filter((v): v is WorkflowEventInstance<any> => !!v);
                      for (const nextEvent of nextEvents) {
                        if (
                          nextEvent !== fastest &&
                          !enqueuedEvents.has(nextEvent)
                        ) {
                          controller.enqueue(nextEvent);
                          enqueuedEvents.add(nextEvent);
                        }
                      }
                    })
                    .catch((err) => {
                      sendEvent(instance);
                      isPendingEvents.add(instance);
                      controller.error(err);
                    });
                }
                break;
              }
            }
          }
          if (queue.length === 0 && pendingTasks.size === 0) {
            await beforeDone();
            // double check
            if (queue.length === 0 && pendingTasks.size === 0) {
              if (verbose) console.log("No more events in the queue");
              break;
            }
          }
        }
        controller.close();
      },
    });
    return stream[Symbol.asyncIterator]();
  }

  // Singleton pattern
  let iterator: AsyncIterableIterator<WorkflowEventInstance<any>> | null = null;

  function getIteratorSingleton(): AsyncIterableIterator<
    WorkflowEventInstance<any>
  > {
    return executorContextAsyncLocalStorage.run(executorContext, () => {
      if (!iterator) iterator = createStreamEvents();
      return iterator;
    });
  }

  return {
    [Symbol.asyncIterator]: getIteratorSingleton,
  };
}
