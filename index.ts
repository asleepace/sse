import { ResponseStream } from './src/response-stream'

import { startKeepAlive } from './src/keep-alive'

const store = new Map<string, ResponseStream>()

function handleServerSideStream() {
  const stream = new ResponseStream()
  stream.pipe(
    Response.json({ version: 1, streamId: stream.streamId }),
    Response.json({ message: 'connected' }),
    startKeepAlive({ interval: 15_000 })
  )
  return stream
}

async function handleBroadcast(request: Request) {
  try {
    if (!request.body) throw new Error('Missing body')

    const streamId = [...store.keys()].at(0)

    if (!streamId) throw new Error('Missing streamId')
    const stream = store.get(streamId)
    if (!stream) throw new Error('Missing stream!')

    console.log('[broadcast] sending:', streamId)

    stream.sink(request.body)

    return Response.json({
      streams: [...store.keys()],
    })
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e))
    console.warn('[broadcast] error:', e)
    return Response.json({ error: true, message: error.message })
  }
}

/**
 * Server
 */
const server = Bun.serve({
  port: 4321,
  hostname: 'localhost',
  development: true,
  idleTimeout: 10,

  async fetch(request) {
    const method = request.method
    const url = new URL(request.url)
    const path = url.pathname
    const headers = request.headers
    const contentType = headers.get('Content-Type')?.toLowerCase()

    console.log(headers.toJSON())

    console.log(`${method} ${path} (${contentType})`)

    switch (path) {
      case '/task':
        return await handleBroadcast(request)

      case '/sse':
        return handleServerSideStream()

      default:
        return new Response(Bun.file('./src/index.html'), {
          headers: {
            'Content-Type': 'text/html',
          },
        })
    }
  },
})
