



/**
 * Sleep for the specified time in ms and then resolve.
 * @param {number} timeInMS - time in ms 
 * @returns {Promise}
 */
export const sleep = (timeInMS: number): Promise<void> => {
  const timer = Promise.withResolvers<void>()
  setTimeout(timer.resolve, timeInMS)
  return timer.promise
}