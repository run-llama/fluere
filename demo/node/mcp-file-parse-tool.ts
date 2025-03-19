import { mcpTool } from 'fluere/interrupter/mcp'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { fileParseWorkflow } from '../workflows/file-parse-agent.js'
import { createWorkflow, workflowEvent } from 'fluere'

const server = new McpServer({
  name: 'Demo',
  version: '1.0.0'
})

const startEvent = workflowEvent<{
  filePath: string
}>()
const stopEvent = workflowEvent<{
  content: ({ type: 'text', text: string })[]
}>()

const wrappedWorkflow = createWorkflow({
  startEvent,
  stopEvent
})

wrappedWorkflow.handle([startEvent],
  async ({ data: { filePath } }) => {fileParseWorkflow.run(filePath)}
)

server.tool('1', {
  filePath: z.string()
}, mcpTool(wrappedWorkflow))