

/**
 *  # Mutex Lock
 * 
 *  Create a lock which can be awaited and unlocked in the future.
 *  Automatically releases when called with using.
 */
export class MutexLock {

  /**
   *  Returns a shared lock object which can be aquired with `aquireLock()`
   *  and can be called multiple times in a row.
   */
  static shared() {
    return (() => {
      const shared = this.locksmith()
      return {
        acquireLock: async (): Promise<MutexLock> => {
          const lock = await shared.next()
          return lock.value
        },
      }
    })()
  }

  private static async *locksmith(): AsyncGenerator<MutexLock> {
    do {
      const lock = new MutexLock()
      yield lock
      await lock.unlocked()
    } while (true)
  }

  // instance properties

  private lock = Promise.withResolvers<void>()
  private done = false

  releaseLock(): void {
    if (this.done) return
    this.done = true
    this.lock.resolve()
  }

  unlocked(): Promise<void> {
    return this.lock.promise
  }

  [Symbol.dispose]() {
    this.releaseLock()
  }
}
