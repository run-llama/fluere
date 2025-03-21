import {
  createWorkflow,
  workflowEvent,
  getContext,
  type Workflow,
  type WorkflowEventData,
} from "fluere";
import { describe, expect, test, beforeEach } from "vitest";
import { promiseHandler } from "../src/interrupter/promise";

const startEvent = workflowEvent<string>({
  debugLabel: "startEvent",
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
      referenceMap = getContext().__dev__reference.next;
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
