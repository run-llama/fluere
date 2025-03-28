const eventMap = new WeakMap<WorkflowEvent<any>, WeakSet<object>>();
const refMap = new WeakMap<WorkflowEventData<any>, WorkflowEvent<any>>();
let i = 0;
let j = 0;

export type WorkflowEventData<Data> = {
  get data(): Data;
};

export type WorkflowEvent<Data> = {
  (data: Data): WorkflowEventData<Data>;
  include(event: unknown): event is WorkflowEventData<Data>;
};

export type WorkflowEventConfig = {
  debugLabel?: string;
};

export const workflowEvent = <Data = void>(
  config?: WorkflowEventConfig,
): WorkflowEvent<Data> => {
  const l1 = `${i++}`;
  const event = (data: Data) => {
    const l2 = `${j++}`;
    const ref = {
      [Symbol.toStringTag]: config?.debugLabel ?? `WorkflowEvent(${l1}.${l2})`,
      toString: () =>
        config?.debugLabel
          ? `${config.debugLabel}(${l2})`
          : `WorkflowEvent(${l1}.${l2})`,
      toJSON: () => {
        return {
          event: l1,
          data,
        };
      },
      get data() {
        return data;
      },
    };
    s.add(ref);
    Object.freeze(ref);
    refMap.set(ref, event);
    return ref;
  };

  const s = new WeakSet();
  eventMap.set(event, s);

  Object.defineProperty(event, Symbol.toStringTag, {
    get: () => config?.debugLabel ?? `WorkflowEvent<${l1}>`,
  });

  Object.defineProperty(event, "displayName", {
    value: config?.debugLabel ?? `WorkflowEvent<${l1}>`,
  });

  event.toString = () => config?.debugLabel ?? `WorkflowEvent<${l1}>`;
  event.include = (
    instance: WorkflowEventData<any>,
  ): instance is WorkflowEventData<Data> => s.has(instance);
  Object.freeze(event);

  return event;
};

// utils
export const eventSource = (
  instance: unknown,
): WorkflowEvent<any> | undefined =>
  typeof instance === "object" && instance !== null
    ? refMap.get(instance as any)
    : undefined;
