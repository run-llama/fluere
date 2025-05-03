import { type WorkflowEvent, WorkflowStream } from "@llama-flow/core";

export const createClient = (
  endpoint: string | URL,
  events: Record<string, WorkflowEvent<any>>,
) => {
  return {
    fetch: async (data: any, requestInit?: Omit<RequestInit, "body">) => {
      const response = await fetch(endpoint, {
        ...requestInit,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...requestInit?.headers,
        },
        body: JSON.stringify(data),
      });
      return WorkflowStream.fromResponse(response, events);
    },
  };
};
