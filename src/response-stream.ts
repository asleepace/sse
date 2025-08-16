import { randomUUIDv7, type HeadersInit } from 'bun'
import { MutexLock } from './mutex'

/**
 *  # Response Stream
 *
 *  This class represents a response stream which can be written to by
 *  external sources like responses.
 *
 */
export class ResponseStream extends Response {
  public readonly streamId: string
  private stream: TransformStream<Uint8Array, Uint8Array>
  private encoder = new TextEncoder()
  private eventId = 0

  private readonly ready: Promise<void>
  private readonly mutex = MutexLock.shared()

  constructor(headers: HeadersInit = {}) {
    const ready = new MutexLock()

    const stream = new TransformStream<Uint8Array, Uint8Array>({
      start: () => {
        ready.releaseLock()
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
      flush: () => {
        console.log('[stream] flushed called!')
      }
    })

    // return readable stream as text/event-stream
    const streamId = randomUUIDv7("hex")

    super(stream.readable, {
      headers: new Headers({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'X-Stream-ID': streamId,
        Connection: 'keep-alive',
        ...headers,
      }),
    })

    // store reference to write later
    this.streamId = streamId
    this.stream = stream
    this.ready = ready.unlocked()
  }

  public async sink(readable: ReadableStream) {
    using mutex = await this.mutex.acquireLock()
    
    await readable.pipeTo(this.stream.writable, {
      preventAbort: true,
      preventCancel: true,
      preventClose: true
    })
  }

  public async pipe(...responses: Response[]) {
    await this.ready
    const mutex = await this.mutex.acquireLock()
    try {
      for await (const resp of responses) {
        if (!resp.body || resp.body.locked) continue
        await resp.body.pipeTo(this.stream.writable, {
          preventAbort: false,
          preventCancel: true,
          preventClose: true,
        })
      }
    } catch (e) {
      console.warn('[pipe] error:', e)
    } finally {
      mutex.releaseLock()
    }
  }
}
