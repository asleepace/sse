import { sleep } from './utils'

export interface KeepAliveOptions {
  interval: number
}

export interface KeepAliveEvent {
  id: number
  createdAt: string
  timestamp: string
  type: 'keep-alive'
}

async function* keepAlivePulse(
  options: KeepAliveOptions
): AsyncGenerator<KeepAliveEvent> {
  const createdAt = new Date()
  let sleepId = 0
  do {
    await sleep(options.interval) // Reduced for testing
    yield {
      id: sleepId++,
      createdAt: createdAt.toISOString(),
      timestamp: new Date().toISOString(),
      type: 'keep-alive',
    }
  } while (true)
}

/**
 * Starts a keep-alive stream which will emit a special "keep-alive" event at the specified
 * interval indefinitely.
 */
export function startKeepAlive(options: KeepAliveOptions): Response {
  const keepAlive = keepAlivePulse(options)
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const data of keepAlive) {
          const sseData = `id: ${
            data.id
          }\nevent: keep-alive\ndata: ${JSON.stringify(data)}\n\n`
          controller.enqueue(new TextEncoder().encode(sseData))
        }
      } catch (error) {
        controller.error(error)
      }
    },
  })
  return new Response(stream)
}
