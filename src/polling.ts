import type { GreenApi, IncomingNotification } from './api'

interface PollHandlers {
  onNotification: (notification: IncomingNotification) => void
  onError: (message: string) => void
  onRecovered: () => void
}

function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve()
    const timeout = globalThis.setTimeout(done, milliseconds)
    signal.addEventListener('abort', done, { once: true })
    function done() {
      globalThis.clearTimeout(timeout)
      signal.removeEventListener('abort', done)
      resolve()
    }
  })
}

export function startPolling(api: GreenApi, handlers: PollHandlers): () => void {
  const controller = new AbortController()
  const { signal } = controller

  async function run() {
    let failures = 0
    while (!signal.aborted) {
      try {
        const envelope = await api.receiveNotification(signal)
        if (signal.aborted) break
        if (envelope) {
          handlers.onNotification(envelope.body)
          await api.deleteNotification(envelope.receiptId, signal)
        } else {
          await delay(500, signal)
        }
        if (failures) handlers.onRecovered()
        failures = 0
      } catch (error) {
        if (signal.aborted) break
        failures += 1
        handlers.onError(error instanceof Error ? error.message : 'Ошибка получения сообщений.')
        await delay(Math.min(1000 * 2 ** (failures - 1), 30000), signal)
      }
    }
  }

  void run()
  return () => controller.abort()
}
