import { z, type ZodRawShape, type ZodTypeAny } from 'zod'
import type { Workflow } from 'fluere'
import { promiseHandler } from './promise'
import type {
  RequestHandlerExtra
} from '@modelcontextprotocol/sdk/shared/protocol.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

const requestHandlerExtraAsyncLocalStorage = new AsyncLocalStorage()

export function mcpTool <
  Args extends ZodRawShape,
  Start extends z.objectOutputType<Args, ZodTypeAny>,
  Stop extends CallToolResult
>(
  workflow: Workflow<Start, Stop>
): (args: Start, extra: RequestHandlerExtra) => CallToolResult | Promise<CallToolResult> {
  return async (args, extra) => {
    const { data } = await promiseHandler(() => requestHandlerExtraAsyncLocalStorage.run(extra, () => workflow.run(args)))
    return data
  }
}