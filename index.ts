import { ResponseStream } from './src/response-stream'
import { Chunk } from './src/stream-event'


function serveStaticFile(fileName: string) {
  return new Response(Bun.file('./src/index.html'), {
    headers: {
      'Content-Type': 'text/html',
    },
  })
}

function parseIncoming(req: Request) {
  const url = new URL(req.url)
  const accept = req.headers.get('accept')
  const method = req.method
  const params = Object.fromEntries(url.searchParams.entries()) as { streamId?: string }
  const path = url.pathname
  const isBlacklisted = ['/.well-', '/.fav'].some((prefix) => path.startsWith(prefix))
  return {
    url,
    accept,
    method,
    params,
    path,
    isBlacklisted,
    body() {
      if (!req.body) throw new Error('Missing body')
      return req.body
    }
  }
}

type Route = ReturnType<typeof parseIncoming>
type RouteHandler = (route: Route) => Promise<Response> | Response | void

function createRouteHandlers() {
  const routeHandlers: RouteHandler[] = []
  const store = new Map<string, ResponseStream>()
  return {
    store() {
      return store
    },
    defineHandler(handler: RouteHandler) {
      routeHandlers.push(handler)
      return this
    },
    async handleRequest(request: Request) {
      const route = parseIncoming(request)
      for (const routeDef of routeHandlers) {
        const maybeResponse = routeDef(route)
        if (maybeResponse) return maybeResponse
      }
      throw new Error(`[server] no handler for route: "${route.path}"`)
    }
  }
}


const routes = createRouteHandlers()

// OPTIONS /sse
//
// Create a new stream and save to the store, this stream can then be
// fetch using the returned stream id.
//
routes.defineHandler((ctx) => {
  if (ctx.method !== 'OPTIONS') return
  const stream = new ResponseStream()
  console.log('[server] created event stream: #', stream.streamId)
  stream.data({ status: 'init', version: 1.1, streamId: stream.streamId })
  routes.store().set(stream.streamId, stream)
  return Response.json({ streamId: stream.streamId })
})

// GET /sse?streamId="<id>"
//
// Returns the text event-stream which was created in the options request,
// each stream has a unique id.
//
routes.defineHandler((ctx) => {
  if (ctx.method !== 'GET') return
  if (ctx.accept !== 'text/event-stream') return
  if (!ctx.path.startsWith('/sse')) return
  if (!ctx.params.streamId) return
  const stream = routes.store().get(ctx.params.streamId)
  stream?.data({ status: 'connected' })
  return stream
})

// POST /sse?streamId="<id>"
//
// Pipe the incoming request body to the specified stream, currently this acts
// likw an echo and will stream the data back down.
//
routes.defineHandler((ctx) => {
  if (ctx.method !== 'POST') return
  if (!ctx.params.streamId) return
  const stream = routes.store().get(ctx.params.streamId)
  if (!stream) return
  stream.sink(ctx.body())
})


// GET */*
//
// Server the client-side HTML page.
//
routes.defineHandler((ctx) => {
  if (ctx.method !== 'GET') return
  return serveStaticFile('/src/index.html')
})


// Server
//
// Initlize the server and specify a few options, the idleTimeout is fairly important
// and will affect the streams (should use keep-alive pulse too)
//
const server = Bun.serve({
  port: 4321,
  hostname: 'localhost',
  development: true,
  idleTimeout: 60,

  async fetch(request) {
    try {
      return routes.handleRequest(request)
    } catch (e) {
      return Response.json(e, { status: 500 })
    }
  }
})

console.log(`[index] started: ${server.url}`)
console.log(`[index] pending requests: `, server.pendingRequests)
routes.store().clear()