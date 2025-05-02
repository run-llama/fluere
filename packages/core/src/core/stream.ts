import {
  eventSource,
  type InferWorkflowEventData,
  isWorkflowEvent,
  type WorkflowEvent,
  type WorkflowEventData,
} from "./event";
import { createSubscribable, type Subscribable } from "./utils";

export class WorkflowStream<R = any>
  extends ReadableStream<R>
  implements AsyncIterable<R>
{
  #stream: ReadableStream<R>;
  #subscribable: Subscribable<[data: R], void>;

  on<T>(
    event: WorkflowEvent<T>,
    handler: (event: WorkflowEventData<T>) => void,
  ): () => void {
    return this.#subscribable.subscribe((ev) => {
      if (event.include(ev)) {
        handler(ev);
      }
    });
  }

  constructor(
    subscribable: Subscribable<[R], void>,
    rootStream: ReadableStream<R>,
  );
  constructor(subscribable: Subscribable<[R], void>, rootStream: null);
  constructor(subscribable: null, rootStream: ReadableStream<R> | null);
  constructor(
    subscribable: Subscribable<[R], void> | null,
    rootStream: ReadableStream<R> | null,
  ) {
    if (!subscribable && !rootStream) {
      throw new TypeError(
        "Either subscribable or root stream must be provided",
      );
    }
    super();
    if (!subscribable) {
      this.#subscribable = createSubscribable<[data: R], void>();
      this.#stream = rootStream!.pipeThrough(
        new TransformStream({
          transform: (ev, controller) => {
            this.#subscribable.publish(ev);
            controller.enqueue(ev);
          },
        }),
      );
      return;
    } else {
      this.#subscribable = subscribable;
      let unsubscribe: () => void;
      this.#stream =
        rootStream ??
        new ReadableStream<R>({
          start: (controller) => {
            unsubscribe = subscribable.subscribe((event) => {
              controller.enqueue(event);
            });
          },
          cancel: () => {
            unsubscribe();
          },
        });
    }
  }

  static fromReadableStream<T = any>(
    stream: ReadableStream<WorkflowEventData<any>>,
  ): WorkflowStream<T> {
    return new WorkflowStream(
      null,
      stream.pipeThrough(
        new TransformStream<WorkflowEventData<any>>({
          transform: (event, controller) => {
            controller.enqueue(event);
          },
        }),
      ),
    );
  }

  static fromResponse(
    response: Response,
    eventMap: Record<string, WorkflowEvent<any>>,
  ): WorkflowStream<WorkflowEventData<any>> {
    const body = response.body;
    if (!body) {
      throw new Error("Response body is not readable");
    }
    const events = Object.values(eventMap);
    return new WorkflowStream(
      null,
      body
        .pipeThrough(new TextDecoderStream())
        .pipeThrough<WorkflowEventData<any>>(
          new TransformStream({
            transform: (chunk, controller) => {
              const eventData = JSON.parse(chunk) as {
                data: ReturnType<WorkflowEvent<any>["with"]>;
                uniqueId: string;
              };
              const targetEvent = events.find(
                (e) => e.uniqueId === eventData.uniqueId,
              );
              if (targetEvent) {
                const ev = targetEvent.with(
                  eventData.data,
                ) as WorkflowEventData<any>;
                controller.enqueue(ev);
              }
            },
          }),
        ),
    );
  }

  toResponse(
    init?: ResponseInit,
  ): R extends WorkflowEventData<any> ? Response : never {
    return new Response(
      this.#stream
        .pipeThrough(
          new TransformStream({
            transform: (data, controller) => {
              // fixme: use a generalized way to stringify all data
              if (eventSource(data)) {
                controller.enqueue(
                  JSON.stringify({
                    data: (data as WorkflowEventData<any>).data,
                    uniqueId: eventSource(data)!.uniqueId,
                  }) + "\n",
                );
              }
            },
          }),
        )
        .pipeThrough(new TextEncoderStream()),
      init,
    ) as any;
  }

  get locked() {
    return this.#stream.locked;
  }

  [Symbol.asyncIterator](): ReadableStreamAsyncIterator<R> {
    return this.#stream[Symbol.asyncIterator]();
  }

  cancel(reason?: any): Promise<void> {
    return this.#stream.cancel(reason);
  }

  // make type compatible with Web ReadableStream API
  getReader(options: { mode: "byob" }): ReadableStreamBYOBReader;
  getReader(): ReadableStreamDefaultReader<R>;
  getReader(options?: ReadableStreamGetReaderOptions): ReadableStreamReader<R>;
  getReader(): any {
    return this.#stream.getReader();
  }

  pipeThrough<T>(
    transform: ReadableWritablePair<T, R>,
    options?: StreamPipeOptions,
  ): WorkflowStream<T> {
    const stream = this.#stream.pipeThrough(transform, options) as any;
    return new WorkflowStream<T>(null, stream);
  }

  pipeTo(
    destination: WritableStream<R>,
    options?: StreamPipeOptions,
  ): Promise<void> {
    return this.#stream.pipeTo(destination, options);
  }

  tee(): [WorkflowStream<R>, WorkflowStream<R>] {
    const [l, r] = this.#stream.tee();
    return [
      new WorkflowStream(this.#subscribable, l),
      new WorkflowStream(this.#subscribable, r),
    ];
  }

  forEach(callback: (item: R) => void): Promise<void> {
    return this.#stream.pipeTo(
      new WritableStream({
        write: (item: R) => {
          callback(item);
        },
      }),
    );
  }

  map<T>(callback: (item: R) => T): WorkflowStream<T> {
    return this.pipeThrough<T>(
      new TransformStream({
        transform: (item, controller) => {
          controller.enqueue(callback(item));
        },
      }),
    );
  }

  values(
    options?: ReadableStreamIteratorOptions,
  ): ReadableStreamAsyncIterator<R> {
    return this.#stream.values(options);
  }

  take(limit: number): WorkflowStream<R> {
    let count = 0;
    return this.pipeThrough(
      new TransformStream({
        transform: (ev, controller) => {
          if (count < limit) {
            controller.enqueue(ev);
            count++;
          }
          if (count >= limit) {
            controller.terminate();
          }
        },
      }),
    );
  }

  filter(
    predicate: R extends WorkflowEventData<any>
      ? WorkflowEvent<InferWorkflowEventData<R>>
      : never,
  ): WorkflowStream<R>;
  filter(predicate: R): WorkflowStream<R>;
  filter(predicate: (event: R) => boolean): WorkflowStream<R>;
  filter(
    predicate:
      | WorkflowEvent<InferWorkflowEventData<R>>
      | ((event: R) => boolean)
      | R,
  ): WorkflowStream<R> {
    return this.pipeThrough(
      new TransformStream({
        transform: (ev, controller) => {
          if (
            typeof predicate === "function"
              ? (predicate as Function)(ev)
              : isWorkflowEvent(predicate)
                ? predicate.include(ev)
                : predicate === ev
          ) {
            controller.enqueue(ev);
          }
        },
      }),
    );
  }

  until(
    predicate: R extends WorkflowEventData<any>
      ? WorkflowEvent<InferWorkflowEventData<R>>
      : never,
  ): WorkflowStream<R>;
  until(predicate: (item: R) => boolean): WorkflowStream<R>;
  until(item: R): WorkflowStream<R>;
  until(
    predicate:
      | WorkflowEvent<InferWorkflowEventData<R>>
      | R
      | ((item: R) => boolean),
  ): WorkflowStream<R> {
    return this.pipeThrough(
      new TransformStream({
        transform: (ev, controller) => {
          controller.enqueue(ev);
          if (
            typeof predicate === "function"
              ? (predicate as Function)(ev)
              : isWorkflowEvent(predicate)
                ? predicate.include(ev)
                : predicate === ev
          ) {
            controller.terminate();
          }
        },
      }),
    );
  }

  async toArray(): Promise<R[]> {
    const events: R[] = [];
    await this.pipeTo(
      new WritableStream({
        write: (event) => {
          events.push(event);
        },
      }),
    );
    return events;
  }
}
