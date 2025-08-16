import { randomUUIDv7, type HeadersInit } from 'bun'
import { MutexLock } from './mutex'
import { Chunk } from './stream-event'

const uniqueId = () => {
  const streamId = randomUUIDv7("base64url").split('-').at(0)
  if (!streamId) throw new Error('Failed to make stream id!')
  return streamId
}

function createChunker() {
  const textEncoder = new TextEncoder("utf-8", {
    ignoreBOM: true,
    fatal: true
  })
  return (text: string): Uint8Array => {
    if (!text) throw new Error('Invalid or missing text!')
    return textEncoder.encode(text)
  }
}

const chunk = createChunker()

export function formatChunk(id: number, data: Uint8Array): Uint8Array {
  const head = chunk(`id: ${id}\ndata: `)
  const tail = chunk(`\n\n`)
  const headLength = head.length
  const tailLength = tail.length
  const dataLength = data.length
  const buffer = new Uint8Array(headLength + tailLength + dataLength)
  buffer.set(head, 0)
  buffer.set(data, headLength)
  buffer.set(tail, headLength + dataLength)
  return buffer
}



/**
 *  # Response Stream
 *
 *  This class represents a response stream which can be written to by
 *  external sources like responses.
 *
 */
export class ResponseStream extends Response {
  private stream: TransformStream<Uint8Array, Uint8Array>
  private eventId = 0

  private readonly ready: Promise<void>
  private readonly mutex = MutexLock.shared()

  public readonly streamId: string
  public get nextEventId() {
    return ++this.eventId
  }

  constructor(headers: HeadersInit = {}) {
    const ready = new MutexLock()

    const stream = new TransformStream<Uint8Array, Uint8Array>({
      start: () => {
        ready.releaseLock()
      },
      transform: (chunk, controller) => {
        // NOTE: debug only
        const output = new TextDecoder().decode(chunk)
        console.log('[stream] transform:', output)

        const message = formatChunk(this.nextEventId, chunk)
        controller.enqueue(message)
      },
    })

    // return readable stream as text/event-stream
    const streamId = uniqueId()

    super(stream.readable, {
      headers: new Headers({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'X-Stream-ID': `${streamId}`,
        Connection: 'keep-alive',
        'Transfer-Encoding': 'chunked',
        ...headers,
      }),
    })

    // store reference to write later
    this.streamId = streamId
    this.stream = stream
    this.ready = ready.unlocked()
  }

  public hasClientLock() {
    return this.eventId > 1
  }

  public async writeSync(uint8: Uint8Array) {
    await this.ready
    using _ = await this.mutex.acquireLock()
    const writer = this.stream.writable.getWriter()
    try {
      await writer.write(uint8)
    } catch (e) {
      console.warn('[stream] write-sync error:', e)
    } finally {
      writer.releaseLock()
    }
  }

  public async keepAlive() {
    await this.writeSync(chunk(': heartbeat\n\n'))
  }

  public async sink(readable: ReadableStream) {
    using mutex = await this.mutex.acquireLock()
    
    await readable.pipeTo(this.stream.writable, {
      preventAbort: true,
      preventCancel: true,
      preventClose: true
    })
  }

  public async data(data: object | String | Uint8Array | Chunk) {
    if (data instanceof Uint8Array) {
      return await this.send({ type: 'uint8', data })
    }
    if (data instanceof String || typeof data === 'string') {
      return await this.send({ type: 'text', data })
    }
    if (data instanceof Chunk) {
      return await this.send({ type: 'chunk', data: data.encode() })
    }
    if (data instanceof Object) {
      return await this.send({ type: 'json', data: data })
    }
    // catch-all and send as-is
    return await this.send({ type: typeof data, data: data })
  }

  public async send(jsonData: object) {
    await this.writeSync(chunk(JSON.stringify(jsonData)))
  }
}
