import { AsyncLocalStorage } from "node:async_hooks";
import type { WorkflowEvent, WorkflowEventData, Handler } from "fluere";

type HookContext = {
  beforeEvents: <
    const AcceptEvents extends WorkflowEvent<any>[],
    Result extends WorkflowEventData<any> | void,
  >(
    handler: Handler<AcceptEvents, Result>,
    ...event: {
      [K in keyof AcceptEvents]: ReturnType<AcceptEvents[K]>;
    }
  ) => void;
  afterEvents: <
    const AcceptEvents extends WorkflowEvent<any>[],
    Result extends WorkflowEventData<any> | void,
  >(
    handler: Handler<AcceptEvents, Result>,
    ...event: {
      [K in keyof AcceptEvents]: ReturnType<AcceptEvents[K]>;
    }
  ) => void;
  __dev__onMismatchEvents: <
    AcceptEvents extends WorkflowEvent<any>[],
    Result extends WorkflowEventData<any> | void,
  >(
    handler: Handler<AcceptEvents, Result>,
    ...event: {
      [K in keyof AcceptEvents]?: ReturnType<AcceptEvents[K]>;
    }
  ) => void;
};

const _hookContextAsyncLocalStorage = new AsyncLocalStorage<HookContext>();

export function _setHookContext<R>(context: Partial<HookContext>, fn: () => R) {
  const prevContext = _hookContextAsyncLocalStorage.getStore();
  return _hookContextAsyncLocalStorage.run(
    {
      beforeEvents: (handler, ...events) => {
        prevContext?.beforeEvents?.(handler, ...events);
        context.beforeEvents?.(handler, ...events);
      },
      afterEvents: (handler, ...events) => {
        prevContext?.afterEvents?.(handler, ...events);
        context.afterEvents?.(handler, ...events);
      },
      __dev__onMismatchEvents(handler, ...events): void {
        prevContext?.__dev__onMismatchEvents?.(handler, ...events);
        context.__dev__onMismatchEvents?.(handler, ...events);
      },
    },
    fn,
  );
}

/**
 * @internal
 */
export function _getHookContext(): HookContext | undefined {
  return _hookContextAsyncLocalStorage.getStore();
}
