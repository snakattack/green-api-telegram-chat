import { describe, expect, it, vi } from 'vitest'
import type { GreenApi } from './api'
import { startPolling } from './polling'

describe('notification polling', () => {
  it('passes a notification to the UI before deleting its queue receipt', async () => {
    const order: string[] = []
    let calls = 0
    const api = {
      receiveNotification: vi.fn((signal: AbortSignal) => {
        calls += 1
        if (calls === 1) return Promise.resolve({ receiptId: 17, body: { typeWebhook: 'incomingMessageReceived' } })
        return new Promise<null>((resolve) => signal.addEventListener('abort', () => resolve(null), { once: true }))
      }),
      deleteNotification: vi.fn(async () => { order.push('delete') }),
    } as unknown as GreenApi
    const stop = startPolling(api, {
      onNotification: () => { order.push('show') },
      onError: () => { throw new Error('Unexpected polling error') },
      onRecovered: () => {},
    })

    await vi.waitFor(() => expect(api.deleteNotification).toHaveBeenCalledWith(17, expect.any(AbortSignal)))
    expect(order).toEqual(['show', 'delete'])
    stop()
  })
})
