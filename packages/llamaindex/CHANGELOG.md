# @llama-flow/llamaindex

## 0.0.16

### Patch Changes

- Updated dependencies [4402a6d]
  - @llama-flow/core@0.4.2

## 0.0.15

### Patch Changes

- Updated dependencies [1005e84]
  - @llama-flow/core@0.4.1

## 0.0.14

### Patch Changes

- 1fb2d98: feat: add `createStatefulMiddleware` API

  Remove `withState` API, because its createContext API type is confusing people,
  causing people cannot figure out what does state belong to (whether context or workflow instance)

  # Breaking Changes

  ## State Middleware API Changes (formerly Store Middleware)

  The state middleware has been significantly improved with a new API and renamed from "store" to "state". Here are the key changes:

  ### Before

  ```typescript
  import { withState } from "@llama-flow/core/middleware/state";

  const workflow = withState(
    () => ({
      count: 0,
      history: [],
    }),
    createWorkflow(),
  );

  // Access state via getState()
  const state = workflow.getState();
  ```

  ### After

  ```typescript
  import { createStatefulMiddleware } from "@llama-flow/core/middleware/state";

  const { withState, getContext } = createStatefulMiddleware(() => ({
    count: 0,
    history: [],
  }));

  const workflow = withState(createWorkflow());

  workflow.handle([], () => {
    const { state } = getContext();
  });

  // Access state via context.state
  const { state } = getContext();
  ```

  ### Migration Guide

  To migrate existing code:

  1. Replace `withState` import with `createStatefulMiddleware`
  2. Update state initialization to use the new API
  3. Replace `workflow.getState()` calls with `getContext().state`
  4. If using input parameters, update the state initialization accordingly
  5. Update all variable names from `state` to `state` in your code

  The new API provides better type safety, more flexibility with input parameters, and a more consistent way to access the state through the workflow context.

- Updated dependencies [1fb2d98]
  - @llama-flow/core@0.4.0

## 0.0.13

### Patch Changes

- Updated dependencies [f59679a]
- Updated dependencies [f3206a9]
- Updated dependencies [80066d0]
- Updated dependencies [2a18aca]
  - @llama-flow/core@0.3.10

## 0.0.12

### Patch Changes

- Updated dependencies [8f1738a]
  - @llama-flow/core@0.3.9

## 0.0.11

### Patch Changes

- afcd9ab: fix(llamaindex): `workflow.run` returns event & context data

## 0.0.10

### Patch Changes

- 9559817: fix: llamaindex workflow edge cases

## 0.0.9

### Patch Changes

- 06f64cb: feat: exactly same API with llamaindex workflow v2

## 0.0.8

### Patch Changes

- 0fee991: fix: export more types from core

## 0.0.7

### Patch Changes

- 6f086ac: fix: bundle package

## 0.0.6

### Patch Changes

- Updated dependencies [89abee2]
  - @llama-flow/core@0.3.8

## 0.0.5

### Patch Changes

- Updated dependencies [e2f8e23]
- Updated dependencies [78b3141]
  - @llama-flow/core@0.3.7

## 0.0.4

### Patch Changes

- Updated dependencies [d8ca6ee]
  - @llama-flow/core@0.3.6

## 0.0.3

### Patch Changes

- Updated dependencies [6f6cb9d]
  - @llama-flow/core@0.3.5

## 0.0.2

### Patch Changes

- 4d5ffb9: feat: add llamaindex binding
