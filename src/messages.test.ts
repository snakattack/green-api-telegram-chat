import { describe, expect, it } from 'vitest'
import { addIncoming, incomingText, type Chat } from './messages'

const notification = {
  typeWebhook: 'incomingMessageReceived',
  idMessage: 'reply-1',
  timestamp: 1760000000,
  senderData: { chatId: '10000000', chatType: 'user', chatName: 'Анна' },
  messageData: { typeMessage: 'textMessage', textMessageData: { textMessage: 'Здравствуйте' } },
}

describe('incoming Telegram messages', () => {
  it('creates a chat for a reply and ignores redelivery of the same message', () => {
    const first = addIncoming([], notification)
    expect(first[0].title).toBe('Анна')
    expect(first[0].messages[0].text).toBe('Здравствуйте')
    expect(addIncoming(first, notification)).toBe(first)
  })

  it('adds a reply to an existing phone chat by Telegram chatId', () => {
    const chats: Chat[] = [{ chatId: '10000000', title: '+79991234567', phone: '79991234567', messages: [] }]
    const updated = addIncoming(chats, notification)
    expect(updated[0].phone).toBe('79991234567')
    expect(updated[0].messages).toHaveLength(1)
  })

  it('ignores non-text events and group messages', () => {
    expect(incomingText({ ...notification, messageData: { typeMessage: 'imageMessage' } })).toBeNull()
    expect(incomingText({ ...notification, senderData: { chatId: '-1000', chatType: 'group' } })).toBeNull()
    expect(incomingText({ ...notification, typeWebhook: 'outgoingMessageStatus' })).toBeNull()
  })
})
