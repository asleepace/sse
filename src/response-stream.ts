import type { HeadersInit } from "bun"
import { chunks } from "./chunk"

/**
 *  # Response Stream
 *
 *  This class represents a response stream which can be written to by
 *  external sources like responses.
 *
 */
export class ResponseStream extends Response {
  private stream: TransformStream<Uint8Array, Uint8Array>
  private encoder = new TextEncoder()
  private eventId = 0

  private isReady: Promise<void>

  constructor(headers: HeadersInit = {}) {
    const ready = Promise.withResolvers<void>()

    const stream = new TransformStream<Uint8Array, Uint8Array>({
      start: () => {
        ready.resolve()
      },
      transform: (chunk, controller) => {
        const eventPrefix = this.encoder.encode(`id: ${this.eventId++}\ndata: `)
        const eventSuffix = this.encoder.encode('\n\n')
        const totalLength =
          eventPrefix.length + chunk.length + eventSuffix.length
        const eventBytes = new Uint8Array(totalLength)
        eventBytes.set(eventPrefix, 0)
        eventBytes.set(chunk, eventPrefix.length)
        eventBytes.set(eventSuffix, eventPrefix.length + chunk.length)
        controller.enqueue(eventBytes)
      },
    })

    // return readable stream as text/event-stream
    super(stream.readable, {
      headers: new Headers({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        ...headers,
      }),
    })

    // store reference to write later
    this.isReady = ready.promise
    this.stream = stream
  }


  public async aquireLock() {
    return this.globalMutex.acquireLock()
  }

  public async send<T extends {}>(obj: T) {
    const json = Response.json(obj).body!
    using writer = await this.aquireWriterMutex()
    using reader = chunks(json)
    for await (const chunk of reader) {
      await writer.write(chunk)
    }
  }

  public async pipe(...responses: Response[]) {
    using writer = await this.aquireWriterMutex()
    try {
      for await (const response of responses) {
        if (!response.body) continue

        // acquire read and write locks
        const reader = response.body.getReader()

        try {
          while (true) {
            const event = await reader.read()
            if (event.done) break
            await writer.write(event.value)
          }
        } finally {
          reader.releaseLock()
        }
      }
    } catch (e) {
      console.warn('Stream error:', e)
    }
  }
}
