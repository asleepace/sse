


export class MutexLock {

  static shared() {
    const shared = this.locksmith()
    return {
      async acquireLock() {
        const lock = await shared.next()
        return lock.value
      }
    }
  }

  private static async* locksmith(): AsyncGenerator<MutexLock> {
    do {
      const lock = new MutexLock()
      yield lock
      await lock.unlocked()
    } while(true)
  }

  // instance properties

  private lock = Promise.withResolvers<void>()
  private done = false

  release(): void {
    if (this.done) return
    this.done = true
    this.lock.resolve()
  }

  protected unlocked(): Promise<void> {
    return this.lock.promise
  }

  [Symbol.dispose]() {
    this.release()
  }
}





