import { createWorkflow } from "@llama-flow/core";
import { startEvent, stopEvent } from "./events";

export const workflow = createWorkflow();

workflow.handle([startEvent], () => stopEvent.with());
