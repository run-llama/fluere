import type { WorkflowEvent, WorkflowEventData } from "fluere";

export type Handler<
  AcceptEvents extends WorkflowEvent<any>[],
  Result extends WorkflowEventData<any> | void,
> = (
  ...event: {
    [K in keyof AcceptEvents]: ReturnType<AcceptEvents[K]>;
  }
) => Result | Promise<Result>;

export type HandlerRef<
  AcceptEvents extends WorkflowEvent<any>[],
  Result extends WorkflowEventData<any> | void,
> = {
  get handler(): Handler<AcceptEvents, Result>;
  unsubscribe: () => void;
};
