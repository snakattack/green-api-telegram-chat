# Telegram-чат через GREEN-API

Небольшой React-интерфейс для отправки и получения текстовых сообщений Telegram через GREEN-API. Приложение работает в браузере без собственного сервера.

**Демо:** https://snakattack.github.io/green-api-telegram-chat/

## Подготовка инстанса

1. Создайте **Telegram-инстанс** в [личном кабинете GREEN-API](https://console.green-api.com/) и авторизуйте его через Telegram.
2. Скопируйте `idInstance`, `apiTokenInstance` и `apiUrl` из карточки инстанса. Адрес API может отличаться от предзаполненного в форме.
3. Для получения сообщений включите `incomingWebhook` и оставьте `webhookUrl` пустым. Это можно сделать в настройках инстанса. Приложение читает очередь через `ReceiveNotification` и подтверждает события через `DeleteNotification`.

## Локальный запуск

Требуется Node.js 20.19+ или 22.12+.

```bash
npm install
npm run dev
```

Откройте адрес, который покажет Vite (обычно `http://localhost:5173`). Введите параметры инстанса, нажмите «Открыть чат», затем создайте чат по номеру получателя в международном формате. Для проверки полного сценария попросите получателя ответить в Telegram.

```bash
npm test
npm run build
npm run preview
```

Папка `dist/` содержит статический сайт и может быть размещена на хостинге статических файлов с HTTPS.

## GitHub Pages

Сайт публикуется через GitHub Actions по адресу https://snakattack.github.io/green-api-telegram-chat/. Workflow из `.github/workflows/pages.yml` собирает и обновляет сайт после каждого пуша в `main`; его также можно запустить вручную на вкладке **Actions**.

Учетные данные GREEN-API не добавляйте в репозиторий и секреты сборки: пользователь вводит их в форме уже на открытом сайте.

## Особенности

- Учетные данные и переписка хранятся только в памяти текущей вкладки. После обновления страницы их нужно ввести заново.
- Используйте одну активную вкладку для одного инстанса: HTTP-очередь уведомлений GREEN-API потребляется и подтверждается одним клиентом.
- Поддерживаются личные текстовые сообщения. Медиа, группы и история до открытия страницы не отображаются.
- Если номер скрыт настройками приватности Telegram, `CheckAccount` может не найти аккаунт.

Документация GREEN-API: [подготовка инстанса](https://green-api.com/telegram/docs/before-start/), [поиск `chatId`](https://green-api.com/telegram/docs/api/chat-id/), [отправка текста](https://green-api.com/telegram/docs/api/sending/SendMessage/), [получение уведомлений](https://green-api.com/telegram/docs/api/receiving/technology-http-api/).
