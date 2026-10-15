import { describe, expect, it, vi } from 'vitest'
import { ApiError, GreenApi, normalizePhone } from './api'

const credentials = {
  apiUrl: 'https://4100.api.green-api.com/',
  idInstance: '4100000000',
  apiTokenInstance: 'exampleToken',
}

function response(body: unknown, status = 200): Response {
  return new Response(body === null ? '' : JSON.stringify(body), { status })
}

describe('GREEN-API client', () => {
  it('checks the instance and resolves a phone number to a Telegram chatId', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response({ stateInstance: 'authorized' }))
      .mockResolvedValueOnce(response({ exist: true, chatId: '10000000' }))
    const api = new GreenApi(credentials, fetcher)

    expect(await api.getState()).toBe('authorized')
    expect(await api.checkAccount('+7 (999) 123-45-67')).toBe('10000000')
    expect(fetcher.mock.calls[0][0]).toBe('https://4100.api.green-api.com/waInstance4100000000/getStateInstance/exampleToken')
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ phoneNumber: 79991234567 })
  })

  it('sends text to the resolved chat and acknowledges a received notification', async () => {
    const event = { receiptId: 42, body: { typeWebhook: 'incomingMessageReceived' } }
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response({ idMessage: 'message-1' }))
      .mockResolvedValueOnce(response(event))
      .mockResolvedValueOnce(response({ result: true }))
    const api = new GreenApi(credentials, fetcher)

    expect(await api.sendMessage('10000000', 'Привет')).toBe('message-1')
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ chatId: '10000000', message: 'Привет' })
    expect(await api.receiveNotification()).toEqual(event)
    await api.deleteNotification(42)
    expect(fetcher.mock.calls[2][0]).toContain('/deleteNotification/exampleToken/42')
    expect(fetcher.mock.calls[2][1].method).toBe('DELETE')
  })

  it('rejects invalid credentials, phone numbers, and API authentication failures', async () => {
    expect(() => new GreenApi({ ...credentials, apiUrl: 'https://example.com' })).toThrow(ApiError)
    expect(() => normalizePhone('123')).toThrow(ApiError)
    const api = new GreenApi(credentials, vi.fn().mockResolvedValue(response({}, 401)))
    await expect(api.getState()).rejects.toThrow('Доступ отклонён')
  })
})
