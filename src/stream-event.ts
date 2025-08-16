export interface ChunkEncodableJSON {
  type: 'text' | 'json' | 'uint8' | 'any'
  data: string
}

export type ChunkType = ChunkEncodableJSON['type']

export interface ChunkEncodable {
  encode(): ChunkEncodableJSON
}

interface ChunkEncodableEvent {
  event?: string
  chunk: ChunkEncodable
}

/**
 * The global sream encoder which handles marking events with ids
 * and event types, and formatting the string. Returns the output
 * as a Uint8Array.
 */
export class ChunkEncoder {
  private lastEventId: number = 0
  private textEncoder: TextEncoder = new TextEncoder()

  encode({ event, chunk }: ChunkEncodableEvent): Uint8Array {
    const items = [
      ['id', String(++this.lastEventId)],
      event ? ['event', event] : undefined,
      ['data', chunk.encode()],
    ]
      .filter((pair): pair is Array<any> => pair !== undefined)
      .map((pair) => pair.join(': '))
      .join('\n')

    // append terminator and encode to binary
    return this.textEncoder.encode(items + '\n')
  }
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

  constructor(public readonly type: ChunkType, public readonly data: string) {}

  public encode(): ChunkEncodableJSON {
    return {
      type: this.type,
      data: this.data,
    }
  }
}
