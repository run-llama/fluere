import {
  createWorkflow,
  workflowEvent,
  getContext,
  type Workflow,
  type WorkflowEventData,
} from "fluere";
import { describe, expect, test, beforeEach } from "vitest";
import { timeoutHandler } from "../src/interrupter/timeout";
import { promiseHandler } from "../src/interrupter/promise";
import { eventSource } from "fluere";

const startEvent = workflowEvent<string>({
  debugLabel: "startEvent",
});
const convertEvent = workflowEvent<number>({
  debugLabel: "convertEvent",
});
const stopEvent = workflowEvent<1 | -1>({
  debugLabel: "stopEvent",
});

let workflow: Workflow<string, 1 | -1>;

beforeEach(() => {
  workflow = createWorkflow<string, 1 | -1>({
    startEvent,
    stopEvent,
  });
});

describe("basic", () => {
  // basic test for workflowEvent
  {
    const ev1 = startEvent("1");
    const ev2 = startEvent("2");
    // they are the same type
    expect(eventSource(ev1) === eventSource(ev2)).toBe(true);
    expect(startEvent.include(ev1)).toBe(true);
    expect(startEvent.include(ev2)).toBe(true);

    expect(ev1 !== ev2).toBe(true);
    expect(ev1.data).toBe("1");
    expect(ev2.data).toBe("2");
  }

  test("sync", async () => {
    workflow.handle([startEvent], (start) => {
      return convertEvent(Number.parseInt(start.data, 10));
    });
    workflow.handle([convertEvent], (convert) => {
      return stopEvent(convert.data > 0 ? 1 : -1);
    });

    const result = await promiseHandler(() => workflow.run("100"));
    expect(result.data).toBe(1);
  });

  test("async", async () => {
    workflow.handle([startEvent], async (start) => {
      return convertEvent(Number.parseInt(start.data, 10));
    });
    workflow.handle([convertEvent], async (convert) => {
      return stopEvent(convert.data > 0 ? 1 : -1);
    });

    const result = await promiseHandler(() => workflow.run("100"));
    expect(result.data).toBe(1);
  });

  test("async + sync", async () => {
    workflow.handle([startEvent], async (start) => {
      return convertEvent(Number.parseInt(start.data, 10));
    });
    workflow.handle([convertEvent], (convert) => {
      return stopEvent(convert.data > 0 ? 1 : -1);
    });

    const result = await promiseHandler(() => workflow.run("100"));
    expect(result.data).toBe(1);
  });

  test("async + timeout", async () => {
    workflow.handle([startEvent], async (start) => {
      return convertEvent(Number.parseInt(start.data, 10));
    });
    workflow.handle([convertEvent], async (convert) => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      return stopEvent(convert.data > 0 ? 1 : -1);
    });

    const result = await promiseHandler(() => workflow.run("100"));
    expect(result.data).toBe(1);
  });
});

describe("condition", () => {
  test("basic", async () => {
    workflow.handle([startEvent], (start) => {
      return start.data === "100" ? stopEvent(1) : stopEvent(-1);
    });

    {
      const result = await promiseHandler(() => workflow.run("100"));
      expect(result.data).toBe(1);
    }

    {
      const result = await promiseHandler(() => workflow.run("200"));
      expect(result.data).toBe(-1);
    }
  });

  test("one event cause two handler", async () => {
    const startEvent = workflowEvent<string>();
    const stopEvent = workflowEvent<string>();
    const jokeEvent = workflowEvent<{ joke: string }>();
    const critiqueEvent = workflowEvent<{ critique: string }>();
    const analysisEvent = workflowEvent<{ analysis: string }>();

    const jokeFlow = createWorkflow({
      startEvent,
      stopEvent,
    });

    jokeFlow.handle([startEvent], async () => {
      return jokeEvent({ joke: "joke" });
    });
    jokeFlow.handle([jokeEvent], async () => {
      return critiqueEvent({ critique: "critique" });
    });
    jokeFlow.handle([jokeEvent], async () => {
      return analysisEvent({ analysis: "analysis" });
    });
    jokeFlow.handle(
      [analysisEvent, critiqueEvent],
      async (analysisEvent, critiqueEvent) => {
        return stopEvent(
          critiqueEvent.data.critique + " " + analysisEvent.data.analysis,
        );
      },
    );

    const result = await promiseHandler(() => jokeFlow.run("pirates"), null);
    expect(result.data).toBeDefined();
    expect(result.data).toBe("critique analysis");
  });
});

describe("loop", () => {
  test("basic", async () => {
    const parseEvent = workflowEvent<number>({
      debugLabel: "parseEvent",
    });
    const parseResultEvent = workflowEvent<number>({
      debugLabel: "parseResult",
    });
    workflow.handle([startEvent], async () => {
      const ev = parseEvent(2);
      getContext().sendEvent(ev);
      await getContext().requireEvent(parseResultEvent);
      return stopEvent(1);
    });
    workflow.handle([parseEvent], async ({ data }) => {
      if (data > 0) {
        const ev = parseEvent(data - 1);
        getContext().sendEvent(ev);
      } else {
        return parseResultEvent(0);
      }
    });
    const result = await promiseHandler(() => workflow.run("100"));
    expect(result.data).toBe(1);
  });

  test("multiple parse", async () => {
    const parseEvent = workflowEvent<number>({
      debugLabel: "parseEvent",
    });
    const parseResultEvent = workflowEvent<number>({
      debugLabel: "parseResult",
    });
    workflow.handle([startEvent], async () => {
      const ev = parseEvent(2);
      getContext().sendEvent(ev);
      await getContext().requireEvent(parseResultEvent);
      getContext().sendEvent(ev);
      await getContext().requireEvent(parseResultEvent);
      return stopEvent(1);
    });
    workflow.handle([parseEvent], async ({ data }) => {
      if (data > 0) {
        const ev = parseEvent(data - 1);
        getContext().sendEvent(ev);
      } else {
        return parseResultEvent(0);
      }
    });
    const result = await promiseHandler(() => workflow.run("100"));
    expect(result.data).toBe(1);
  });
});

describe("multiple inputs", () => {
  test("basic", async () => {
    workflow.handle([startEvent], (start) => {
      const ev1 = convertEvent(Number.parseInt(start.data, 10));
      const ev2 = convertEvent(Number.parseInt(start.data, 10));
      getContext().sendEvent(ev1);
      return ev2;
    });
    workflow.handle([convertEvent, convertEvent], (convert1, convert2) => {
      return stopEvent(convert1.data + convert2.data > 0 ? 1 : -1);
    });

    const result = await promiseHandler(() => workflow.run("100"));
    expect(result.data).toBe(1);
  });

  test("require events", async () => {
    workflow.handle([startEvent], (start) => {
      for (let i = 0; i < 100; i++) {
        getContext().sendEvent(convertEvent(Number.parseInt(start.data, 10)));
      }
      return;
    });
    workflow.handle(
      Array.from({ length: 100 }).map(() => convertEvent),
      async () => {
        return stopEvent(1);
      },
    );

    const result = await promiseHandler(() => workflow.run("100"));
    expect(result.data).toBe(1);
  });

  test("require events with timeout", async () => {
    workflow.handle([startEvent], async (start) => {
      for (let i = 0; i < 100; i++) {
        await new Promise((resolve) => setTimeout(resolve, 1));
        getContext().sendEvent(convertEvent(Number.parseInt(start.data, 10)));
      }
    });

    workflow.handle(
      Array.from({ length: 100 }).map(() => convertEvent),
      async () => {
        return stopEvent(1);
      },
    );

    const result = await promiseHandler(() => workflow.run("100"));
    expect(result.data).toBe(1);
  });

  test("require events with no await", async () => {
    workflow.handle([startEvent], async (start) => {
      for (let i = 0; i < 100; i++) {
        // it's not possible to detect if/when the event is sent
        setTimeout(() => {
          getContext().sendEvent(convertEvent(Number.parseInt(start.data, 10)));
        }, 10);
      }
    });

    workflow.handle(
      Array.from({ length: 100 }).map(() => convertEvent),
      async () => {
        return stopEvent(1);
      },
    );

    {
      const result = await promiseHandler(() => workflow.run("100"));
      expect(result.data).toBe(1);
    }

    {
      const result = await timeoutHandler(() => workflow.run("100"));
      expect(result.data).toBe(1);
    }
  });
});

describe("message queue", async () => {
  test("basic", async () => {
    const messageEvent = workflowEvent<string>({
      debugLabel: "messageEvent",
    });
    workflow.handle([startEvent], () => {
      const context = getContext();
      context.sendEvent(messageEvent("message"));
      return stopEvent(1);
    });

    const executor = workflow.run("100");
    const queue: WorkflowEventData<any>[] = [];
    for await (const i of executor) {
      queue.push(i);
      if (stopEvent.include(i)) {
        break;
      }
    }
    expect(queue.map((q) => q.data)).toEqual(["100", "message", 1]);
  });
});

describe("source of the event data", () => {
  test("basic", async () => {
    const events: WorkflowEventData<any>[] = [];
    let referenceMap: WeakMap<
      WorkflowEventData<any>,
      WorkflowEventData<any>
    > = null!;
    workflow.handle([startEvent], (event) => {
      referenceMap = getContext().reference.next;
      events.push(event);
      expect(event.data).toBe("data");
      const e = stopEvent(1);
      events.push(e);
      return e;
    });

    const result = await promiseHandler(() => workflow.run("data"));
    expect(result.data).toBe(1);

    expect(events.length).toBe(2);
    expect(referenceMap.get(events[0]!)).toBe(events[1]);
  });

  test("loop", async () => {
    const parseEvent = workflowEvent<number>({
      debugLabel: "parseEvent",
    });
    const parseResultEvent = workflowEvent<number>({
      debugLabel: "parseResult",
    });
    workflow.handle([startEvent], async () => {
      getContext().sendEvent(parseEvent(2));
      getContext().sendEvent(parseEvent(2));
      await Promise.all([
        getContext().requireEvent(parseResultEvent),
        getContext().requireEvent(parseResultEvent),
      ]);
      return stopEvent(1);
    });
    workflow.handle([parseEvent], async ({ data }) => {
      if (data > 0) {
        getContext().sendEvent(parseEvent(data - 1));
      } else {
        return parseResultEvent(0);
      }
    });
    const events: WorkflowEventData<any>[] = [];
    for await (const event of workflow.run("100")) {
      events.push(event);
      if (stopEvent.include(event)) {
        break;
      }
    }
    expect(events.length).toBe(10);
  });
});

describe("llm", async () => {
  test("tool call agent", async () => {
    const startEvent = workflowEvent<string>({
      debugLabel: "startEvent",
    });
    const chatEvent = workflowEvent<string>({
      debugLabel: "chatEvent",
    });
    const toolCallEvent = workflowEvent<string>({
      debugLabel: "toolCallEvent",
    });
    const toolCallResultEvent = workflowEvent<string>({
      debugLabel: "toolCallResultEvent",
    });
    const stopEvent = workflowEvent<string>({
      debugLabel: "stopEvent",
    });
    const workflow = createWorkflow({
      startEvent,
      stopEvent,
    });

    workflow.handle([startEvent], async ({ data }) => {
      const context = getContext();
      context.sendEvent(chatEvent(data));
    });
    workflow.handle([toolCallEvent], async () => {
      return toolCallResultEvent("CHAT");
    });
    let once = true;
    workflow.handle([chatEvent], async ({ data }) => {
      expect(data).toBe("CHAT");
      const context = getContext();
      if (once) {
        once = false;
        const result = (
          await Promise.all(
            ["tool_call"].map(async (tool_call) => {
              context.sendEvent(toolCallEvent(tool_call));
              return context.requireEvent(toolCallResultEvent);
            }),
          )
        )
          .map(({ data }) => data)
          .join("\n");
        context.sendEvent(chatEvent(result));
        return await context.requireEvent(chatEvent);
      } else {
        return stopEvent("STOP");
      }
    });

    const result = await promiseHandler(() => workflow.run("CHAT"));
    expect(result.data).toBe("STOP");
  });
});
