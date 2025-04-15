import { promiseHandler } from "@llama-flow/core/interrupter/promise";
import {
  fileParseWorkflow,
  startEvent,
  stopEvent,
} from "../workflows/file-parse-agent.js";

const directory = "..";

promiseHandler(fileParseWorkflow, startEvent.with(directory), stopEvent).then(
  () => {
    console.log("r", fileParseWorkflow.getStore().output);
  },
);
