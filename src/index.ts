import { Hono } from 'hono'
import type { Context } from 'grammy'
import { Bot, webhookCallback } from 'grammy'
import type { User, Chat, MessageOriginHiddenUser } from 'grammy/types'

interface Env {
  BOT_TOKEN: string
}

const app = new Hono<{ Bindings: Env }>()

// Format user information
function formatUserInfo(user: User): string {
  let info = ''
  if (user.username) info += `@${user.username}\n`
  info += `Id: ${user.id}\n`
  info += `First: ${user.first_name}\n`
  if (user.last_name) info += `Last: ${user.last_name}\n`
  if (user.language_code) info += `Lang: ${user.language_code}\n`
  return info
}

// Format channel/chat information
function formatChannelInfo(chat: Chat): string {
  let info = ''
  if ('username' in chat && chat.username) info += `@${chat.username}\n`
  info += `Id: ${chat.id}\n`
  if ('title' in chat && chat.title) info += `Title: ${chat.title}\n`
  return info
}

// Format hidden user information
function formatHiddenUserInfo(origin: MessageOriginHiddenUser): string {
  let info = `Hidden User: ${origin.sender_user_name}\n`
  info += `Date: ${new Date(origin.date * 1000).toLocaleString()}\n`
  return info
}

function createBot(token: string) {
  console.log('[INFO] Creating bot instance')
  const bot = new Bot(token)

  bot.on('message', async (ctx: Context) => {
    try {
      const message = ctx.message
      if (!message) {
        console.warn('[INFO] No message found in context')
        return ctx.reply('No message found.')
      }

      let responseText = ''

      if (message.forward_origin) {
        console.log(
          `[INFO] Processing forwarded message - type: ${message.forward_origin.type}`
        )

        switch (message.forward_origin.type) {
          case 'user':
            responseText = formatUserInfo(message.forward_origin.sender_user)
            break

          case 'channel':
            const channel = message.forward_origin.chat
            responseText = formatChannelInfo(channel)
            if (
              'username' in channel &&
              channel.username &&
              message.forward_origin.message_id
            ) {
              responseText += `https://t.me/${channel.username}/${message.forward_origin.message_id}`
            }
            break

          case 'chat':
            responseText = formatChannelInfo(message.forward_origin.sender_chat)
            break

          case 'hidden_user':
            responseText = formatHiddenUserInfo(message.forward_origin)
            break

          default:
            responseText = 'Unknown forward origin type.'
            break
        }
      } else if (message.from) {
        console.log('[INFO] Processing regular message from user')
        responseText = formatUserInfo(message.from)
      } else {
        console.warn('[INFO] No user information available in message')
        responseText = 'No user information available.'
      }

      if (responseText) {
        console.log(`[INFO] Sending reply - length: ${responseText.length} chars`)
        await ctx.reply(responseText, {
          link_preview_options: {
            is_disabled: true,
          },
        })
      }
    } catch (error) {
      console.error('[ERROR] Error processing message:', error)
      await ctx
        .reply('Error processing message, please try again later.')
        .catch((replyError) => {
          console.error('[ERROR] Failed to send error reply:', replyError)
        })
    }
  })

  return bot
}

app.post('/webhook', async (c) => {
  const token = c.env.BOT_TOKEN

  if (!token) {
    return c.json({ error: 'BOT_TOKEN not configured' }, 500)
  }

  const bot = createBot(token)
  const handleUpdate = webhookCallback(bot, 'hono')

  return handleUpdate(c)
})

app.get('/', (c) => {
  return c.json({
    status: 'ok',
    platform: 'cloudflare-workers',
    version: '1.0.0',
    message: 'UserInfo Telegram Bot',
    description: 'Forward any message to get user info',
    timestamp: new Date().toISOString(),
  })
})

app.onError((err, c) => {
  console.error('[ERROR] Global error:', err)
  return c.json({ error: 'Internal server error' }, 500)
})

export default app
