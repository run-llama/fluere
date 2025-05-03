import type { Workflow, WorkflowContext } from "@llama-flow/core";

export const createServer = (
  workflow: Workflow,
  initRequest: (
    json: any,
    sendEvent: WorkflowContext["sendEvent"],
  ) => void | Promise<void>,
  handleStream: (
    stream: WorkflowContext["stream"],
  ) => WorkflowContext["stream"],
) => {
  return async function fetch(request: Request): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", {
        status: 405,
      });
    }
    const json = await request.json();
    const { stream, sendEvent } = workflow.createContext();
    await initRequest(json, sendEvent);
    return handleStream(stream).toResponse();
  };
};
