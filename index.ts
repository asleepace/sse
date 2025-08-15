
import { MutexLock } from "./src/mutex";

function sleep(timeInMs: number) {
  const timer = Promise.withResolvers<void>()
  setTimeout(timer.resolve, timeInMs)
  return timer.promise
}


class ResponseStream {

  private mutex = MutexLock.shared()
  private id = 0

  async sleep(time: number) {
    using _ = await this.mutex.acquireLock()

    const id = ++this.id
    console.log(`Stream #${id} started`)

    await sleep(time)
    console.log(`Stream #${id} finished`)
  }
}


const stream = new ResponseStream()
stream.sleep(1_000)
stream.sleep(1_000)
stream.sleep(1_000)
stream.sleep(1_000)
stream.sleep(1_000)
















