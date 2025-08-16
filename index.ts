import { ResponseStream } from './src/response-stream'

async function serveStaticFile(fileName: string) {
  return new Response(await Bun.file(fileName), {
    status: 200,
    headers: {
      'Content-Type': 'text/html',
      'Accept': '*/*',
    },
  })
}

//  Store
//
//  Shared information about the routes, handlers and streams.
//
const routes = createRouteHandlers()

function parseIncoming(req: Request) {
  const url = new URL(req.url)
  const accept = req.headers.get('accept')
  const method = req.method
  const params = Object.fromEntries(url.searchParams.entries()) as { streamId?: string }
  const path = url.pathname
  const isBlacklisted = ['/.well-', '/.fav'].some((prefix) => path.startsWith(prefix))
  const streamId = params.streamId
  const stream = streamId ? routes.store().get(streamId) : undefined
  return {
    pattern() {
      return [method.toUpperCase(), path].join(' ')
    },
    url,
    accept,
    method,
    params,
    path,
    isBlacklisted,
    body() {
      if (!req.body) throw new Error('Missing body')
      return req.body
    },
    stream,
    hasStream() {
      return this.stream !== undefined
    }
  }
}

type Route = ReturnType<typeof parseIncoming>
type RouteHandler = (route: Route) => Promise<Response | void> | Response | void

function createRouteHandlers() {
  const routeHandlers = new Map<string, RouteHandler>()
  const store = new Map<string, ResponseStream>()
  return {
    store() {
      return store
    },
    defineHandler(prefix: `${Uppercase<string>} ${ '/' | '*' }${string}`, handler: RouteHandler) {
      routeHandlers.set(prefix, handler)
      return this
    },
    async handleRequest(request: Request) {
      const route = parseIncoming(request)
      const prefix = route.pattern()
      console.log(`[server] ${prefix}`)

      for (const [routePrefix, routeDef] of routeHandlers.entries()) {
        console.log('[server] checking: ', routePrefix)
        if (routePrefix === route.pattern() || routePrefix.includes('*')) {

          const maybeResponse = await routeDef(route)
          if (maybeResponse) return maybeResponse
        }
      }

      console.log('[server] no handler for:', prefix)
      throw new Error(`[server] no handler for route: "${route.path}"`)
    }
  }
}

// OPTIONS /sse
//
// Create a new stream and save to the store, this stream can then be
// fetch using the returned stream id.
//
routes.defineHandler('OPTIONS /sse', (ctx) => {
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
routes.defineHandler('GET /sse', async (ctx) => {
  if (!ctx.hasStream()) return
  const stream = ctx.stream!

  if (stream.hasClientLock()) {
    await stream.keepAlive()
    console.log('[sse] keep-alive sent!')
    return stream
  }

  stream.data({ status: 'connected' })
  return stream
})

// POST /sse?streamId="<id>"
//
// Pipe the incoming request body to the specified stream, currently this acts
// likw an echo and will stream the data back down.
//
routes.defineHandler('POST /sse', async (ctx) => {
  if (!ctx.params.streamId) return
  const stream = routes.store().get(ctx.params.streamId)
  if (!stream) return
  await stream.sink(ctx.body())
})


// GET */*
//
// Server the client-side HTML page.
//
routes.defineHandler('GET *', async () => {
  return await serveStaticFile('./src/index.html')
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
      console.log('[server]', request.url)
      return await routes.handleRequest(request)
    } catch (e) {
      return await serveStaticFile('./src/index.html')
    }
  }
})

console.log(`[index] started: ${server.url}`)
console.log(`[index] pending requests: `, server.pendingRequests)
