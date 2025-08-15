

/**
 *  # chunks(..args)
 *  
 *  Returns an object with an async-iterator and a dispose symbol,
 *  will iterate over a readable stream yielding results until the
 *  stream is consumed. 
 * 
 * 
 *  @param {ReadableStream<any>} readableStream - any readable stream.
 */
export function chunks<T>(readableStream: ReadableStream<T>) {
  const reader = readableStream.getReader()
  return {
    async *[Symbol.asyncIterator]() {
      try {
        do {
          const { value, done } = await reader.read()
          if (done) break
          yield value
        } while(true)
      } catch(e) {
        console.warn('[chunk] error:', e)
      }
    },
    [Symbol.dispose]() {
      console.log('[chunk] releasing lock!')
      reader.releaseLock()
    }
  }
}