import { NextRequest } from "next/server";
import type { Workflow, WorkflowEventData } from "fluere";
import { promiseHandler } from "./promise";

type WorkflowAPI = {
  GET: (request: NextRequest) => Promise<Response>;
};

export const createNextHandler = <Start, Stop>(
  workflow: Workflow<Start, Stop>,
  getStart: (
    request: NextRequest,
  ) =>
    | Start
    | WorkflowEventData<Start>
    | Promise<Start | WorkflowEventData<Start>>,
): WorkflowAPI => {
  return {
    GET: async (request) => {
      const result = await promiseHandler(workflow, await getStart(request));
      return Response.json(result.data);
    },
  };
};
