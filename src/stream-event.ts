export interface ChunkEncodableJSON {
  type: 'text' | 'json' | 'uint8' | 'stream'
  data: string
}

export type ChunkType = ChunkEncodableJSON['type']

export interface ChunkEncodable {
  encode(): Uint8Array
}

interface ChunkEncodableEvent {
  event?: string
  chunk: ChunkEncodable
}

/**
 *  Quickly test if the given source is a JSON encoded string.
 */
export function isMaybeJSONString(str: unknown): str is string {
  if (!str || typeof str !== 'string' || str.length < 1) return false
  const hasStartTags = str.startsWith('{') || str.startsWith('{')
  const hasCloseTags = str.endsWith('}') || str.endsWith(']')
  return hasStartTags && hasCloseTags
}

/**
 *  Represents a variety of various encodable data types and wraps
 *  in a uniform container to allow easy decoding on the client.
 *
 */
export class Chunk implements ChunkEncodable {
  static readonly textDecoder = new TextDecoder()
  static readonly textEncoder = new TextEncoder()
  static lastChunkId = 0

  static withStream(stream: ReadableStream) {
    const transformer = new TransformStream({
      transform(chunk, controller) {
        const id = ++Chunk.lastChunkId
        const head = Chunk.textEncoder.encode(`id: ${id}\n`)
        const tail = Chunk.textEncoder.encode(`\n\n`)
        const headLength = head.length
        const tailLength = tail.length
        const dataLength = chunk.length
        const totalLength = headLength + tailLength + dataLength

        console.log({ tail, totalLength, requesst: controller.desiredSize }) 

        const eventBytes = new Uint8Array(totalLength)
        eventBytes.set(head, 0)
        eventBytes.set(chunk, head.length)
        eventBytes.set(tail, head.length + chunk.length)
        controller.enqueue(eventBytes)
      }
    })
    stream.pipeTo(transformer.writable)
    return transformer.readable
  }

  /**
   * Attempt to encode the source to a chunk or throw an error.
   */
  static from(source: unknown): Chunk | never {
    if (source == null || source === undefined)
      throw new Error('Invalid empty source!')
    if (typeof source === 'function')
      throw new Error('Invalid source type: "function"')

    // attempt to decode as text if it's a data stream
    if (source instanceof Uint8Array) {
      const decodedText = this.textDecoder.decode(source)
      return Chunk.from(decodedText)
    } else if (typeof source === 'object') {
      return Chunk.from(JSON.stringify(source))
    } else if (isMaybeJSONString(source)) {
      return new Chunk('json', source)
    } else {
      return new Chunk('text', String(source))
    }
  }

  static uint8(binary: Uint8Array) {
    return new Chunk('uint8', binary.join(','))
  }

  static json<T extends {}>(object: T) {
    return new Chunk('json', JSON.stringify(object))
  }

  static text(text: string) {
    return new Chunk('text', text)
  }

  static stream() {
    return new Chunk('stream', null as any)
  }

  constructor(public readonly type: ChunkType, public readonly data: string) {}

  get idString(): string {
    const id = ++Chunk.lastChunkId
    return `id: ${id}`
  }

  get eventString() {
    return ""
    // return `event: '${this.type}'`
  }

  get dataString() {
    return `data: ${this.data}`
  }

  public encode(): Uint8Array {
    if (this.type === 'stream' || !this.data) {
      return Chunk.textEncoder.encode(`${this.idString}\n`)
    }
    const formatted = `${this.idString}\n${this.eventString}\n${this.dataString}\n\n`
    console.log(formatted)
    return Chunk.textEncoder.encode(formatted)
  }
}
