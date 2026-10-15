export interface Credentials {
  apiUrl: string
  idInstance: string
  apiTokenInstance: string
}

export interface IncomingNotification {
  typeWebhook?: string
  idMessage?: string
  timestamp?: number
  senderData?: {
    chatId?: string
    chatType?: string
    chatName?: string
    senderName?: string
    senderPhoneNumber?: number
  }
  messageData?: {
    typeMessage?: string
    textMessageData?: { textMessage?: string }
  }
}

export interface NotificationEnvelope {
  receiptId: number
  body: IncomingNotification
}

export class ApiError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message)
    this.name = 'ApiError'
  }
}

export function normalizeCredentials(input: Credentials): Credentials {
  let url: URL
  try {
    url = new URL(input.apiUrl.trim())
  } catch {
    throw new ApiError('Укажите корректный API URL из личного кабинета GREEN-API.')
  }
  const allowedHost = url.hostname === 'api.green-api.com' || /^[a-z0-9-]+\.api\.green-api\.com$/.test(url.hostname)
  if (url.protocol !== 'https:' || !allowedHost || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new ApiError('Укажите HTTPS API URL из личного кабинета GREEN-API.')
  }
  const idInstance = input.idInstance.trim()
  const apiTokenInstance = input.apiTokenInstance.trim()
  if (!/^\d+$/.test(idInstance) || !apiTokenInstance || !/^[A-Za-z0-9_-]+$/.test(apiTokenInstance)) {
    throw new ApiError('Проверьте ID и токен инстанса.')
  }
  return { apiUrl: url.origin, idInstance, apiTokenInstance }
}

export function normalizePhone(value: string): string {
  const phone = value.replace(/[\s()+-]/g, '')
  if (!/^\d{7,15}$/.test(phone)) {
    throw new ApiError('Введите номер в международном формате: от 7 до 15 цифр.')
  }
  return phone
}

export class GreenApi {
  private readonly credentials: Credentials

  constructor(credentials: Credentials, private readonly fetcher: typeof fetch = fetch) {
    this.credentials = normalizeCredentials(credentials)
  }

  private async request<T>(methodName: string, method: 'GET' | 'POST' | 'DELETE', body?: unknown, signal?: AbortSignal, suffix = ''): Promise<T> {
    const { apiUrl, idInstance, apiTokenInstance } = this.credentials
    const url = `${apiUrl}/waInstance${idInstance}/${methodName}/${apiTokenInstance}${suffix}`
    let response: Response
    try {
      response = await this.fetcher(url, {
        method,
        headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal,
      })
    } catch (error) {
      if (signal?.aborted) throw error
      throw new ApiError('Не удалось связаться с GREEN-API. Проверьте соединение и API URL.')
    }
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw new ApiError('Доступ отклонён. Проверьте ID, токен и API URL.', response.status)
      if (response.status === 429 || response.status === 466) throw new ApiError('Достигнут лимит запросов GREEN-API. Повторите позже.', response.status)
      throw new ApiError(`GREEN-API вернул ошибку ${response.status}.`, response.status)
    }
    const raw = await response.text()
    if (!raw) return null as T
    try {
      return JSON.parse(raw) as T
    } catch {
      throw new ApiError('GREEN-API вернул некорректный ответ.')
    }
  }

  async getState(signal?: AbortSignal): Promise<string> {
    const result = await this.request<{ stateInstance: string }>('getStateInstance', 'GET', undefined, signal)
    return result.stateInstance
  }

  async checkAccount(phone: string): Promise<string | null> {
    const result = await this.request<{ exist?: boolean; chatId?: string; status?: boolean; reason?: string }>(
      'checkAccount', 'POST', { phoneNumber: Number(normalizePhone(phone)) },
    )
    if (result.status === false) throw new ApiError(result.reason || 'Не удалось проверить номер в Telegram.')
    return result.exist && result.chatId ? result.chatId : null
  }

  async sendMessage(chatId: string, message: string): Promise<string> {
    const result = await this.request<{ idMessage?: string }>('sendMessage', 'POST', { chatId, message })
    if (!result?.idMessage) throw new ApiError('GREEN-API не подтвердил отправку сообщения.')
    return result.idMessage
  }

  receiveNotification(signal?: AbortSignal): Promise<NotificationEnvelope | null> {
    return this.request('receiveNotification', 'GET', undefined, signal, '?receiveTimeout=5')
  }

  async deleteNotification(receiptId: number, signal?: AbortSignal): Promise<void> {
    const result = await this.request<{ result: boolean }>('deleteNotification', 'DELETE', undefined, signal, `/${receiptId}`)
    if (!result?.result) throw new ApiError('Не удалось подтвердить получение уведомления.')
  }
}
