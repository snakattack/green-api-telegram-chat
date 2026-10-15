import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { ApiError, GreenApi, normalizePhone, type Credentials } from './api'
import { addIncoming, incomingText, type Chat, type Message } from './messages'
import { startPolling } from './polling'

const initialCredentials: Credentials = {
  apiUrl: 'https://api.green-api.com',
  idInstance: '',
  apiTokenInstance: '',
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Произошла неизвестная ошибка.'
}

function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat('ru', { hour: '2-digit', minute: '2-digit' }).format(timestamp)
}

function latestMessage(chat: Chat): Message | undefined {
  return chat.messages.at(-1)
}

function avatarLabel(title: string): string {
  return title.startsWith('+') ? title.slice(1, 3) : title.charAt(0).toUpperCase()
}

export default function App() {
  const [credentials, setCredentials] = useState<Credentials>(initialCredentials)
  const [api, setApi] = useState<GreenApi | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [connectError, setConnectError] = useState('')
  const [pollError, setPollError] = useState('')
  const [chats, setChats] = useState<Chat[]>([])
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null)
  const [newChatOpen, setNewChatOpen] = useState(false)
  const [phone, setPhone] = useState('')
  const [creatingChat, setCreatingChat] = useState(false)
  const [chatError, setChatError] = useState('')
  const [draft, setDraft] = useState('')
  const [composerError, setComposerError] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const selectedChat = chats.find((chat) => chat.chatId === selectedChatId)
  const sortedChats = useMemo(() => [...chats].sort((a, b) =>
    (latestMessage(b)?.timestamp || 0) - (latestMessage(a)?.timestamp || 0)), [chats])

  useEffect(() => {
    if (!api) return
    return startPolling(api, {
      onNotification(notification) {
        const parsed = incomingText(notification)
        if (parsed) {
          setChats((current) => addIncoming(current, notification))
          setSelectedChatId((current) => current ?? parsed.chatId)
        }
      },
      onError: setPollError,
      onRecovered: () => setPollError(''),
    })
  }, [api])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [selectedChatId, selectedChat?.messages.length])

  async function connect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (connecting) return
    setConnecting(true)
    setConnectError('')
    try {
      const client = new GreenApi(credentials)
      const state = await client.getState()
      if (state !== 'authorized') {
        throw new ApiError(`Инстанс не готов к работе: ${state}. Авторизуйте его в личном кабинете GREEN-API.`)
      }
      setChats([])
      setSelectedChatId(null)
      setPollError('')
      setApi(client)
    } catch (error) {
      setConnectError(errorText(error))
    } finally {
      setConnecting(false)
    }
  }

  function disconnect() {
    setApi(null)
    setChats([])
    setSelectedChatId(null)
    setCredentials(initialCredentials)
    setPhone('')
    setDraft('')
    setNewChatOpen(false)
    setPollError('')
    setConnectError('')
  }

  async function createChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!api || creatingChat) return
    setChatError('')
    setCreatingChat(true)
    try {
      const normalized = normalizePhone(phone)
      const chatId = await api.checkAccount(normalized)
      if (!chatId) throw new ApiError('Telegram-аккаунт по этому номеру не найден или номер скрыт настройками приватности.')
      setChats((current) => current.some((chat) => chat.chatId === chatId)
        ? current
        : [{ chatId, title: `+${normalized}`, phone: normalized, messages: [] }, ...current])
      setSelectedChatId(chatId)
      setPhone('')
      setNewChatOpen(false)
    } catch (error) {
      setChatError(errorText(error))
    } finally {
      setCreatingChat(false)
    }
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!api || !selectedChat || sending) return
    const text = draft.trim()
    if (!text) return
    if (text.length > 4096) {
      setComposerError('Сообщение не должно превышать 4096 символов.')
      return
    }
    const localId = `local-${crypto.randomUUID()}`
    const chatId = selectedChat.chatId
    const pending: Message = { id: localId, chatId, text, timestamp: Date.now(), direction: 'outgoing', state: 'pending' }
    setSending(true)
    setComposerError('')
    setDraft('')
    setChats((current) => current.map((chat) => chat.chatId === chatId
      ? { ...chat, messages: [...chat.messages, pending] }
      : chat))
    try {
      const idMessage = await api.sendMessage(chatId, text)
      setChats((current) => current.map((chat) => chat.chatId === chatId
        ? { ...chat, messages: chat.messages.map((message) => message.id === localId ? { ...message, id: idMessage, state: 'sent' } : message) }
        : chat))
    } catch (error) {
      setComposerError(errorText(error))
      setChats((current) => current.map((chat) => chat.chatId === chatId
        ? { ...chat, messages: chat.messages.map((message) => message.id === localId ? { ...message, state: 'failed' } : message) }
        : chat))
    } finally {
      setSending(false)
    }
  }

  async function retryMessage(message: Message) {
    if (!api || sending || message.state !== 'failed') return
    setSending(true)
    setComposerError('')
    setChats((current) => current.map((chat) => chat.chatId === message.chatId
      ? { ...chat, messages: chat.messages.map((item) => item.id === message.id ? { ...item, state: 'pending' } : item) }
      : chat))
    try {
      const idMessage = await api.sendMessage(message.chatId, message.text)
      setChats((current) => current.map((chat) => chat.chatId === message.chatId
        ? { ...chat, messages: chat.messages.map((item) => item.id === message.id ? { ...item, id: idMessage, state: 'sent' } : item) }
        : chat))
    } catch (error) {
      setComposerError(errorText(error))
      setChats((current) => current.map((chat) => chat.chatId === message.chatId
        ? { ...chat, messages: chat.messages.map((item) => item.id === message.id ? { ...item, state: 'failed' } : item) }
        : chat))
    } finally {
      setSending(false)
    }
  }

  if (!api) {
    return (
      <main className="login-page">
        <div className="login-card">
          <div className="brand-mark" aria-hidden="true"><span>✦</span></div>
          <div className="eyebrow">GREEN-API × TELEGRAM</div>
          <h1>Ваши сообщения.<br /><span>В одном окне.</span></h1>
          <p className="intro">Подключите Telegram-инстанс GREEN-API, чтобы отправлять сообщения и получать ответы прямо здесь.</p>
          <form onSubmit={connect} className="login-form">
            <label htmlFor="id-instance">ID инстанса</label>
            <input id="id-instance" inputMode="numeric" autoComplete="off" placeholder="Например, 4100000000" value={credentials.idInstance} onChange={(event) => setCredentials({ ...credentials, idInstance: event.target.value })} required />
            <label htmlFor="api-token">Токен инстанса</label>
            <input id="api-token" type="password" autoComplete="off" placeholder="apiTokenInstance" value={credentials.apiTokenInstance} onChange={(event) => setCredentials({ ...credentials, apiTokenInstance: event.target.value })} required />
            <label htmlFor="api-url">API URL <span>из личного кабинета</span></label>
            <input id="api-url" type="url" autoComplete="off" value={credentials.apiUrl} onChange={(event) => setCredentials({ ...credentials, apiUrl: event.target.value })} required />
            {connectError && <div className="alert" role="alert">{connectError}</div>}
            <button className="primary-button" type="submit" disabled={connecting}>{connecting ? 'Подключаем…' : 'Открыть чат'} <span aria-hidden="true">→</span></button>
          </form>
          <p className="login-footnote">Данные используются только в этой вкладке и исчезнут после перезагрузки страницы.</p>
        </div>
        <div className="login-art" aria-hidden="true">
          <div className="art-glow" />
          <div className="art-chat art-chat-left"><span className="art-avatar">А</span><span><i /><i /></span></div>
          <div className="art-chat art-chat-right"><span><i /><i /></span><span className="art-avatar">В</span></div>
          <div className="art-chat art-chat-left art-chat-small"><span className="art-avatar">А</span><span><i /></span></div>
          <div className="art-caption">Просто оставайтесь на связи.</div>
        </div>
      </main>
    )
  }

  return (
    <main className={`chat-app ${selectedChatId ? 'chat-selected' : ''}`}>
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-brand"><div className="brand-mark small" aria-hidden="true">✦</div><div><strong>Сообщения</strong><span>Telegram через GREEN-API</span></div></div>
          <button className="icon-button" type="button" onClick={disconnect} title="Отключить инстанс" aria-label="Отключить инстанс">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 17l5-5-5-5M15 12H3"/><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6"/></svg>
          </button>
        </div>
        <div className="sidebar-actions">
          <button className="new-chat-button" type="button" onClick={() => { setNewChatOpen((value) => !value); setChatError('') }} aria-expanded={newChatOpen}>
            <span className="plus-icon" aria-hidden="true">＋</span> Новый чат
          </button>
        </div>
        {newChatOpen && (
          <form className="new-chat-form" onSubmit={createChat}>
            <label htmlFor="phone">Номер получателя</label>
            <input id="phone" type="tel" autoFocus placeholder="+7 999 123 45 67" value={phone} onChange={(event) => setPhone(event.target.value)} required />
            <p>Международный формат, с кодом страны.</p>
            {chatError && <div className="inline-error" role="alert">{chatError}</div>}
            <button type="submit" disabled={creatingChat}>{creatingChat ? 'Проверяем…' : 'Создать чат'}</button>
          </form>
        )}
        <div className="chat-list-heading">ЧАТЫ <span>{chats.length}</span></div>
        <div className="chat-list">
          {sortedChats.length === 0 ? (
            <div className="sidebar-empty">Здесь появятся ваши переписки. Начните с нового чата.</div>
          ) : sortedChats.map((chat) => {
            const last = latestMessage(chat)
            return (
              <button className={`chat-list-item ${selectedChatId === chat.chatId ? 'active' : ''}`} type="button" key={chat.chatId} onClick={() => { setSelectedChatId(chat.chatId); setComposerError('') }}>
                <span className="avatar">{avatarLabel(chat.title)}</span>
                <span className="chat-list-copy"><span className="chat-list-top"><strong>{chat.title}</strong><time>{last ? formatTime(last.timestamp) : ''}</time></span><span className="preview">{last ? `${last.direction === 'outgoing' ? 'Вы: ' : ''}${last.text}` : 'Новый чат'}</span></span>
              </button>
            )
          })}
        </div>
        <div className="sidebar-footer"><span className="connection-dot" /> Инстанс {credentials.idInstance} подключён</div>
      </aside>

      <section className="conversation" aria-label="Переписка">
        {selectedChat ? (
          <>
            <header className="conversation-header">
              <button className="icon-button back-button" type="button" onClick={() => setSelectedChatId(null)} aria-label="К списку чатов">←</button>
              <span className="avatar header-avatar">{avatarLabel(selectedChat.title)}</span>
              <div className="conversation-title"><strong>{selectedChat.title}</strong><span>Telegram ID {selectedChat.chatId}</span></div>
              <div className="header-badge">TELEGRAM</div>
            </header>
            {pollError && <div className="poll-warning" role="status">Не удаётся получать сообщения: {pollError} Повторяем подключение…</div>}
            <div className="messages" aria-live="polite">
              {selectedChat.messages.length === 0 && <div className="empty-conversation"><div className="empty-icon">✦</div><h2>Начните разговор</h2><p>Напишите первое сообщение — ответ появится здесь.</p></div>}
              {selectedChat.messages.map((message) => (
                <div className={`message-row ${message.direction}`} key={message.id}>
                  <div className={`bubble ${message.state}`}>
                    <p>{message.text}</p>
                    <div className="message-meta"><time>{formatTime(message.timestamp)}</time>{message.state === 'pending' && <span>Отправляем…</span>}{message.state === 'failed' && <button type="button" onClick={() => void retryMessage(message)}>Не отправлено · Повторить</button>}</div>
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
            <div className="composer-wrap">
              {composerError && <div className="composer-error" role="alert">{composerError}</div>}
              <form className="composer" onSubmit={send}>
                <input aria-label="Текст сообщения" placeholder="Напишите сообщение…" value={draft} onChange={(event) => { setDraft(event.target.value); if (composerError) setComposerError('') }} maxLength={4097} />
                <span className={`character-count ${draft.length > 4096 ? 'over-limit' : ''}`}>{draft.length > 3800 ? `${draft.length}/4096` : ''}</span>
                <button type="submit" disabled={sending || !draft.trim() || draft.trim().length > 4096} aria-label="Отправить сообщение" title="Отправить сообщение">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg>
                </button>
              </form>
              <div className="composer-hint">Только текстовые сообщения</div>
            </div>
          </>
        ) : (
          <div className="welcome-state"><div className="welcome-symbol">✦</div><h2>Добро пожаловать</h2><p>Выберите переписку слева или создайте новый чат, чтобы отправить сообщение в Telegram.</p><button type="button" onClick={() => setNewChatOpen(true)}>Создать чат <span aria-hidden="true">→</span></button>{pollError && <div className="poll-warning" role="status">Не удаётся получать сообщения: {pollError}</div>}</div>
        )}
      </section>
    </main>
  )
}
