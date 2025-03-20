import { beforeEach, describe, expect, test, vi } from "vitest";
import { getContext } from "../../src/core/create-executor";
import { createWorkflow } from "../../src/core/create-workflow";
import {
  eventSource,
  workflowEvent,
  type WorkflowEventData,
} from "../../src/core/event";
import { readableStream } from "../../src/core/readable-stream";

describe("workflow basic", () => {
  const startEvent = workflowEvent<string>();
  const convertEvent = workflowEvent<number>();
  const stopEvent = workflowEvent<number>();
  let workflow: ReturnType<typeof createWorkflow<string, number>>;
  beforeEach(() => {
    // refresh workflow
    workflow = createWorkflow({
      startEvent,
      stopEvent,
    });
  });

  test("workflow event", () => {
    const ev1 = startEvent("1");
    const ev2 = startEvent("2");
    // they are the same type
    expect(eventSource(ev1) === eventSource(ev2)).toBe(true);
    expect(startEvent.include(ev1)).toBe(true);
    expect(startEvent.include(ev2)).toBe(true);

    expect(ev1 !== ev2).toBe(true);
    expect(ev1.data).toBe("1");
    expect(ev2.data).toBe("2");
  });

  test("sync", async () => {
    workflow.handle([startEvent], (start) => {
      return convertEvent(Number.parseInt(start.data, 10));
    });
    workflow.handle([convertEvent], (convert) => {
      return stopEvent(convert.data > 0 ? 1 : -1);
    });

    const stream = readableStream(workflow.run("100"));
    const events: WorkflowEventData<any>[] = [];
    for await (const ev of stream) {
      events.push(ev);
    }
    expect(events).toHaveLength(3);
    expect(events.at(-1)!.data).toBe(1);
  });

  test("async", async () => {
    workflow.handle([startEvent], async (start) => {
      return convertEvent(Number.parseInt(start.data, 10));
    });
    workflow.handle([convertEvent], async (convert) => {
      return stopEvent(convert.data > 0 ? 1 : -1);
    });

    const stream = readableStream(workflow.run("100"));
    const events: WorkflowEventData<any>[] = [];
    for await (const ev of stream) {
      events.push(ev);
    }
    expect(events).toHaveLength(3);
    expect(events.at(-1)!.data).toBe(1);
  });

  test("async + sync", async () => {
    workflow.handle([startEvent], async (start) => {
      return convertEvent(Number.parseInt(start.data, 10));
    });
    workflow.handle([convertEvent], (convert) => {
      return stopEvent(convert.data > 0 ? 1 : -1);
    });

    const stream = readableStream(workflow.run("100"));
    const events: WorkflowEventData<any>[] = [];
    for await (const ev of stream) {
      events.push(ev);
    }
    expect(events).toHaveLength(3);
    expect(events.at(-1)!.data).toBe(1);
  });

  test("async + timeout", async () => {
    workflow.handle([startEvent], async (start) => {
      return convertEvent(Number.parseInt(start.data, 10));
    });
    workflow.handle([convertEvent], async (convert) => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      return stopEvent(convert.data > 0 ? 1 : -1);
    });

    const stream = readableStream(workflow.run("100"));
    const events: WorkflowEventData<any>[] = [];
    for await (const ev of stream) {
      events.push(ev);
    }
    expect(events).toHaveLength(3);
    expect(events.at(-1)!.data).toBe(1);
  });
});

describe("workflow simple logic", () => {
  const startEvent = workflowEvent();
  const stopEvent = workflowEvent();
  test("should work with single handler", async () => {
    const workflow = createWorkflow({
      startEvent,
      stopEvent,
    });
    const f1 = vi.fn(async () => stopEvent());
    workflow.handle([startEvent], f1);

    const executor = workflow.run();
    const stream = readableStream(executor);
    const events: WorkflowEventData<any>[] = [];
    for await (const ev of stream) {
      events.push(ev);
    }
    expect(f1).toBeCalledTimes(1);
    expect(events).toHaveLength(2);
  });

  test("should work with multiple handlers", async () => {
    const workflow = createWorkflow({
      startEvent,
      stopEvent,
    });
    const event = workflowEvent();
    const f1 = vi.fn(async () => event());
    const f2 = vi.fn(async () => stopEvent());
    workflow.handle([startEvent], f1);

    workflow.handle([event], f2);
    const executor = workflow.run();
    const stream = readableStream(executor);
    const events: WorkflowEventData<any>[] = [];
    for await (const ev of stream) {
      events.push(ev);
    }
    expect(f1).toBeCalledTimes(1);
    expect(f2).toBeCalledTimes(1);
    expect(events).toHaveLength(3);
  });

  test("should work with multiple handlers (if-else)", async () => {
    const startEvent = workflowEvent<number>();
    const stopEvent = workflowEvent();
    const workflow = createWorkflow({
      startEvent,
      stopEvent,
    });
    const f1 = vi.fn(async ({ data }: ReturnType<typeof startEvent>) =>
      data > 0 ? startEvent(data - 1) : stopEvent(),
    );
    workflow.handle([startEvent], f1);
    {
      const executor = workflow.run(1);
      const stream = readableStream(executor);
      const events: WorkflowEventData<any>[] = [];
      for await (const ev of stream) {
        events.push(ev);
      }
      expect(f1).toBeCalledTimes(2);
      expect(events).toHaveLength(3);
    }
    f1.mockClear();
    {
      const executor = workflow.run(-1);
      const stream = readableStream(executor);
      const events: WorkflowEventData<any>[] = [];
      for await (const ev of stream) {
        events.push(ev);
      }
      expect(f1).toBeCalledTimes(1);
      expect(events).toHaveLength(2);
    }
  });

  test("should work with multiple handlers (if-else loop)", async () => {
    const workflow = createWorkflow({
      startEvent,
      stopEvent,
    });
    const event1 = workflowEvent<number>();
    const event2 = workflowEvent<number>();
    const f1 = vi.fn(async () => event1(2));
    const f2 = vi.fn(async ({ data }: ReturnType<typeof event1>) =>
      event2(data - 1),
    );
    const f3 = vi.fn(async ({ data }: ReturnType<typeof event2>) =>
      data > 0 ? event1(data) : stopEvent(),
    );
    workflow.handle([startEvent], f1);

    workflow.handle([event1], f2);

    workflow.handle([event2], f3);
    const executor = workflow.run();
    const stream = readableStream(executor);
    const events: WorkflowEventData<any>[] = [];
    for await (const ev of stream) {
      events.push(ev);
    }
    expect(f1).toBeCalledTimes(1);
    expect(f2).toBeCalledTimes(2);
    expect(f3).toBeCalledTimes(2);
    expect(events).toHaveLength(6);
  });
});

describe("workflow context api", () => {
  const startEvent = workflowEvent({
    debugLabel: "startEvent",
  });
  const stopEvent = workflowEvent({
    debugLabel: "stopEvent",
  });
  test("should exist in workflow", async () => {
    const workflow = createWorkflow({
      startEvent,
      stopEvent,
    });
    const fn = vi.fn(() => {
      const context = getContext();
      expect(context).toBeDefined();
      expect(context.requireEvent).toBeTypeOf("function");
      expect(context.sendEvent).toBeTypeOf("function");
      return stopEvent();
    });
    workflow.handle([startEvent], fn);
    const executor = workflow.run();
    const stream = readableStream(executor);
    const events: WorkflowEventData<any>[] = [];
    for await (const ev of stream) {
      events.push(ev);
    }
    expect(fn).toBeCalledTimes(1);
    expect(events).toHaveLength(2);
  });

  test("should work when request event single", async () => {
    const aEvent = workflowEvent({
      debugLabel: "aEvent",
    });
    const aResultEvent = workflowEvent({
      debugLabel: "aResultEvent",
    });
    const workflow = createWorkflow({
      startEvent,
      stopEvent,
    });
    const fn = vi.fn(async () => {
      const context = getContext();
      context.sendEvent(aEvent());
      await context.requireEvent(aResultEvent);
      return stopEvent();
    });
    const fn2 = vi.fn(async () => {
      return aResultEvent();
    });
    workflow.handle([startEvent], fn);
    workflow.handle([aEvent], fn2);
    const executor = workflow.run();
    const stream = readableStream(executor);
    const events: WorkflowEventData<any>[] = [];
    for await (const ev of stream) {
      events.push(ev);
    }
    expect(fn).toBeCalledTimes(1);
    expect(events.map((e) => eventSource(e))).toEqual([
      startEvent,
      aEvent,
      aResultEvent,
      stopEvent,
    ]);
    expect(events).toHaveLength(4);
  });
});
