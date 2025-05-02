import { withSnapshot, request } from "@llama-flow/core/middleware/snapshot";
import { createWorkflow, workflowEvent, getContext } from "@llama-flow/core";
import { OpenAI } from "openai";

const openai = new OpenAI();

const workflow = withSnapshot(createWorkflow());

const startEvent = workflowEvent<string>({
  debugLabel: "start",
});
const humanInteractionEvent = workflowEvent<string>({
  debugLabel: "humanInteraction",
});
const stopEvent = workflowEvent<string>({
  debugLabel: "stop",
});

workflow.handle([startEvent], async ({ data }) => {
  const response = await openai.chat.completions.create({
    stream: false,
    model: "gpt-4.1",
    messages: [
      {
        role: "system",
        content: `You are a helpful assistant.
If user doesn't provide his/her name, call ask_name tool to ask for user's name.
Otherwise, analyze user's name with a good meaning and return the analysis.

For example, alex is from "Alexander the Great", who was a king of the ancient Greek kingdom of Macedon and one of history's greatest military minds.`,
      },
      {
        role: "user",
        content: data,
      },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "ask_name",
          description: "Ask for user's name",
          parameters: {
            type: "object",
            properties: {
              message: {
                type: "string",
                description: "The message to ask for user's name",
              },
            },
            required: ["message"],
          },
        },
      },
    ],
  });
  const tools = response.choices[0].message.tool_calls;
  if (tools && tools.length > 0) {
    const askName = tools.find((tool) => tool.function.name === "ask_name");
    if (askName) {
      return request(humanInteractionEvent, askName.function.arguments);
    }
  }
  return stopEvent.with(response.choices[0].message.content!);
});

workflow.handle([humanInteractionEvent], async ({ data }) => {
  const { sendEvent } = getContext();
  // going back to the start event
  sendEvent(startEvent.with(data));
});

export { workflow, startEvent, humanInteractionEvent, stopEvent };
