# fluere

fluere 🌊 is a simple, lightweight workflow engine, inspired
by [LlamaIndex Workflow](https://docs.llamaindex.ai/en/stable/module_guides/workflow/)

[![Bundle Size](https://img.shields.io/bundlephobia/min/fluere)](https://bundlephobia.com/result?p=fluere)
[![Bundle Size](https://img.shields.io/bundlephobia/minzip/fluere)](https://bundlephobia.com/result?p=fluere)

- Minimal core API (<=2kb)
- 100% Type safe
- Event-driven execution engine
- Support multiple JS runtime/framework

## Usage

```shell
npm i fluere
```

### First, define events

```ts
import { workflowEvent } from "fluere";

const startEvent = workflowEvent<string>();
const stopEvent = workflowEvent<1 | -1>();
```

### Connect events with workflow

```ts
import { createWorkflow } from "fluere";

const convertEvent = workflowEvent();

const workflow = createWorkflow({
  startEvent,
  stopEvent,
});

workflow.handle([startEvent], (start) => {
  return convertEvent(Number.parseInt(start.data, 10));
});
workflow.handle([convertEvent], (convert) => {
  return stopEvent(convert.data > 0 ? 1 : -1);
});
```

## Concepts

- **Workflow**: A directed graph of event handlers.
- **Event**: A named signal that can be emitted with data attached.
- **Handler**: A function that processes events and can emit new events.

# LICENSE

MIT
