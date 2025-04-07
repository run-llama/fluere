import type {
  Handler,
  Workflow,
  WorkflowContext,
  WorkflowEvent,
  WorkflowEventData,
} from "fluere";
import { isPromiseLike } from "../core/utils";
import {
  createHandlerDecorator,
  decoratorRegistry,
} from "./trace-events/create-handler-decorator";
import { runOnce } from "./trace-events/run-once";
import type { HandlerContext } from "../core/internal/context";

type TracingContext = Record<string, unknown>;

const tracingWeakMap = new WeakMap<
  WorkflowContext,
  WeakMap<
    WorkflowEvent<any>[],
    WeakMap<
      Handler<WorkflowEvent<any>[], WorkflowEventData<any> | void>,
      TracingContext
    >
  >
>();

const eventToHandlerContextWeakMap = new WeakMap<
  WorkflowEventData<any>,
  HandlerContext
>();

type WorkflowTraceableContext = WorkflowContext & {
  createFilter: <T extends WorkflowEventData<any>, U extends T>(
    eventData: WorkflowEventData<any>,
    filter: (eventData: T) => eventData is U,
  ) => (eventData: T) => eventData is U;
};

export type HandlerRef<
  AcceptEvents extends WorkflowEvent<any>[],
  Result extends ReturnType<WorkflowEvent<any>["with"]> | void,
  Fn extends Handler<AcceptEvents, Result>,
> = {
  get handler(): Fn;
};

export function withTraceEvents<
  WorkflowLike extends {
    handle<
      const AcceptEvents extends WorkflowEvent<any>[],
      Result extends ReturnType<WorkflowEvent<any>["with"]> | void,
    >(
      accept: AcceptEvents,
      handler: Handler<AcceptEvents, Result>,
    ): void;
    createContext(): WorkflowContext;
  },
>(
  workflow: WorkflowLike,
): Omit<WorkflowLike, "handle" | "createContext"> & {
  handle<
    const AcceptEvents extends WorkflowEvent<any>[],
    Result extends ReturnType<WorkflowEvent<any>["with"]> | void,
    Fn extends Handler<AcceptEvents, Result>,
  >(
    accept: AcceptEvents,
    handler: Fn,
  ): HandlerRef<AcceptEvents, Result, Fn>;
  createContext(): WorkflowTraceableContext;
} {
  return {
    ...workflow,
    handle: <
      const AcceptEvents extends WorkflowEvent<any>[],
      Result extends ReturnType<WorkflowEvent<any>["with"]> | void,
      Fn extends Handler<AcceptEvents, Result>,
    >(
      accept: AcceptEvents,
      handler: Fn,
    ): HandlerRef<AcceptEvents, Result, Fn> => {
      workflow.handle(accept, handler);
      return {
        get handler(): Fn {
          return handler;
        },
      };
    },
    createContext(): WorkflowTraceableContext {
      const context = workflow.createContext();
      tracingWeakMap.set(context, new WeakMap());
      context.__internal__call_send_event.add((event, handlerContext) => {
        eventToHandlerContextWeakMap.set(event, handlerContext);
      });
      context.__internal__call_context.add((handlerContext, next) => {
        handlerContext.inputs.forEach((input) => {
          if (!eventToHandlerContextWeakMap.has(input)) {
            console.warn("unregistered event detected");
          }
          eventToHandlerContextWeakMap.set(input, handlerContext);
        });
        const inputEvents = handlerContext.inputEvents;
        const handlersWeakMap = tracingWeakMap.get(context)!;
        if (!handlersWeakMap.has(inputEvents)) {
          handlersWeakMap.set(inputEvents, new WeakMap());
        }
        const handlerWeakMap = handlersWeakMap.get(inputEvents)!;

        const originalHandler = handlerContext.handler;
        let finalHandler = originalHandler;
        let handlerMiddleware: Handler<
          WorkflowEvent<any>[],
          WorkflowEventData<any> | void
        >;
        if (!handlerWeakMap) {
          throw new Error(
            "Handler context is not defined, this should not happen. Please report this issue with a reproducible example.",
          );
        }
        const tracingContext: TracingContext =
          handlerWeakMap.get(originalHandler) ?? {};
        if (!handlerWeakMap.has(originalHandler)) {
          handlerWeakMap.set(originalHandler, tracingContext);
        }

        const onAfterHandlers = [] as (() => void)[];
        const onBeforeHandlers = [] as ((
          nextHandler: Handler<
            WorkflowEvent<any>[],
            WorkflowEventData<any> | void
          >,
        ) => Handler<WorkflowEvent<any>[], WorkflowEventData<any> | void>)[];
        handlerMiddleware = (...args) => {
          const result = onBeforeHandlers.reduce((next, cb) => {
            return cb(next);
          }, finalHandler)(...args);
          if (isPromiseLike(result)) {
            return result.then((result) => {
              onAfterHandlers.forEach((cb) => {
                cb();
              });
              return result;
            });
          } else {
            onAfterHandlers.forEach((cb) => {
              cb();
            });
            return result;
          }
        };
        [...decoratorRegistry]
          .filter(([, { handlers }]) =>
            handlers.has(
              handlerContext.handler as Handler<
                WorkflowEvent<any>[],
                WorkflowEventData<any> | void
              >,
            ),
          )
          .forEach(
            ([name, { getInitialValue, onAfterHandler, onBeforeHandler }]) => {
              if (!tracingContext[name]) {
                tracingContext[name] = getInitialValue();
              }
              onBeforeHandlers.push((next) =>
                onBeforeHandler(next, handlerContext, tracingContext[name]),
              );
              onAfterHandlers.push(() => {
                tracingContext[name] = onAfterHandler(tracingContext[name]);
              });
            },
          );
        next({
          ...handlerContext,
          handler: handlerMiddleware,
        });
      });
      const createFilter = function createFilter(
        eventData: WorkflowEventData<any>,
        filter: (eventData: WorkflowEventData<any>) => boolean,
      ) {
        const rootContext = eventToHandlerContextWeakMap.get(eventData);
        return (eventData: WorkflowEventData<any>): boolean => {
          let isInSameContext = false;
          let currentEventContext = eventToHandlerContextWeakMap.get(eventData);
          while (currentEventContext) {
            if (currentEventContext === rootContext) {
              isInSameContext = true;
              break;
            }
            currentEventContext = currentEventContext.prev;
          }
          return isInSameContext && filter(eventData);
        };
      };
      Object.defineProperty(context, "createFilter", {
        value: createFilter,
      });
      return context as WorkflowTraceableContext;
    },
  };
}

export { createHandlerDecorator, runOnce };
