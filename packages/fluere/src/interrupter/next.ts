import { NextRequest } from "next/server";
import type { Workflow } from "fluere";
import { promiseHandler } from "./promise";

type WorkflowAPI = {
  GET: (request: NextRequest) => Promise<Response>;
};

export const createNextHandler = <Start, Stop>(
  getExecutor: (
    request: NextRequest,
  ) => ReturnType<Workflow<Start, Stop>["run"]>,
): WorkflowAPI => {
  return {
    GET: async (request) => {
      const result = await promiseHandler(() => getExecutor(request));
      return Response.json(result.data);
    },
  };
};
