import { promiseHandler } from "fluere/interrupter/promise";
import { fileParseWorkflow } from "../workflows/file-parse-agent.js";

const directory = "..";

promiseHandler(fileParseWorkflow, directory).then(({ data }) => {
  console.log("stop", data);
});
