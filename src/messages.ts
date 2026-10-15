import type { IncomingNotification } from './api'

export interface Message {
  id: string
  chatId: string
  text: string
  timestamp: number
  direction: 'incoming' | 'outgoing'
  state: 'sent' | 'pending' | 'failed'
}

export interface Chat {
  chatId: string
  title: string
  phone?: string
  messages: Message[]
}

export function incomingText(notification: IncomingNotification): { chatId: string; title: string; message: Message } | null {
  if (notification.typeWebhook !== 'incomingMessageReceived') return null
  const sender = notification.senderData
  const data = notification.messageData
  if (!sender?.chatId || (sender.chatType && sender.chatType !== 'user' && sender.chatType !== 'bot')) return null
  if (data?.typeMessage !== 'textMessage' || typeof data.textMessageData?.textMessage !== 'string' || !notification.idMessage) return null
  return {
    chatId: sender.chatId,
    title: sender.chatName || sender.senderName || sender.chatId,
    message: {
      id: notification.idMessage,
      chatId: sender.chatId,
      text: data.textMessageData.textMessage,
      timestamp: typeof notification.timestamp === 'number' ? notification.timestamp * 1000 : Date.now(),
      direction: 'incoming',
      state: 'sent',
    },
  }
}

export function addIncoming(chats: Chat[], notification: IncomingNotification): Chat[] {
  const parsed = incomingText(notification)
  if (!parsed) return chats
  const existing = chats.find((chat) => chat.chatId === parsed.chatId)
  if (existing?.messages.some((message) => message.id === parsed.message.id)) return chats
  if (!existing) return [{ chatId: parsed.chatId, title: parsed.title, messages: [parsed.message] }, ...chats]
  return chats.map((chat) => chat.chatId === parsed.chatId
    ? { ...chat, messages: [...chat.messages, parsed.message] }
    : chat)
}
