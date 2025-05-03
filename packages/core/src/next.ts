import { NextRequest } from "next/server";
import type {
  Workflow,
  WorkflowEventData,
  WorkflowEvent,
} from "@llama-flow/core";
import { run } from "./stream/run";

type WorkflowAPI = {
  GET: (request: NextRequest) => Promise<Response>;
};

export const createNextHandler = <Start, Stop>(
  workflow: Workflow,
  getStart: (
    request: NextRequest,
  ) => WorkflowEventData<Start> | Promise<WorkflowEventData<Start>>,
  stop: WorkflowEvent<Stop>,
): WorkflowAPI => {
  return {
    GET: async (request) => {
      const result = await run(workflow, await getStart(request))
        .until(stop)
        .toArray();
      return Response.json(result.at(-1)!.data);
    },
  };
};
