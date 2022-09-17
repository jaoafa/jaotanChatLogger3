import mysql from 'mysql2/promise'
import {
  ChannelType,
  FetchMessagesOptions,
  Message,
  NewsChannel,
  TextChannel,
  ThreadChannel,
} from 'discord.js'
import {
  getDBMessage,
  getDBMessageIds,
  getDisplayContent,
  getLastEditedDBMessage,
  isDisabled,
  md5hex,
} from './utils'
import { getClient } from '../main'
import { getDBConnection } from './mysql'

export async function fixOldMessageContents() {
  console.log('Starting to fix old message contents')
  const client = getClient()
  if (client === null || client.user === null) {
    return
  }
  const conn = await getDBConnection()
  if (conn === null) {
    return
  }

  const channels = []
  for (const guild of client.guilds.cache.values()) {
    for (const channel of guild.channels.cache.values()) {
      if (channel.type !== ChannelType.GuildText) continue
      if (!channel.permissionsFor(client.user)?.has('ViewChannel')) continue
      channels.push(channel)
    }
  }

  await Promise.all(
    channels.map(async (channel) => {
      console.log(`Adding fix old messages from ${channel.name}`)
      const messageIds = await getDBMessageIds(conn, channel)

      let beforeId = null
      let newMessageCount = 0
      try {
        while (true) {
          const params: FetchMessagesOptions = {
            limit: 100,
          }
          if (beforeId !== null) {
            params.before = beforeId
          }
          const messages = await channel.messages.fetch(params)
          if (messages.size === 0) break

          for (const message of messages.values()) {
            if (!messageIds.includes(message.id)) continue
            await fixMessageContent(conn, message)
            newMessageCount++
          }

          beforeId = messages.last()?.id
          const _sleep = (ms: number | undefined) =>
            new Promise((resolve) => setTimeout(resolve, ms))
          await _sleep(2000)
        }
      } catch (e) {
        console.error(e)
      }

      console.log(`Added ${newMessageCount} new messages from ${channel.name}!`)
    })
  )
  console.log('Finished fix old messages')
}

async function fixMessageContent(conn: mysql.Connection, message: Message) {
  if (
    !(
      message.channel instanceof TextChannel ||
      message.channel instanceof NewsChannel ||
      message.channel instanceof ThreadChannel
    )
  ) {
    return
  }

  if (await isDisabled(conn, message)) {
    return
  }

  try {
    const dbMessage = await getDBMessage(conn, message.id)
    if (dbMessage === null) {
      return
    }
    if (dbMessage.rawtext.length > 0) {
      return
    }
    const oldHex = md5hex(message.content)
    const newHex = md5hex(dbMessage.rawtext)
    const oldEditedMessage = await getLastEditedDBMessage(conn, message.id)
    const oldEditedHex = oldEditedMessage !== null ? md5hex(oldEditedMessage.rawtext) : null
    if (oldHex === newHex) {
      return
    }
    if (oldEditedHex === newHex) {
      return
    }
    console.log(
      `Fix message: ${message.cleanContent.substring(0, 10)} by ${
        message.author.tag
      } (${message.id}) in ${message.channel.name} (${message.channelId})`
    )

    await conn.execute(
      'UPDATE `message-createds` SET displaytext = ?, rawtext = ? WHERE msgid = ?',
      [getDisplayContent(message), message.content, message.id]
    )
  } catch (e) {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    if (e.code === 'ER_DUP_ENTRY') {
      return
    }
    console.error(e)
  }
  await conn.commit()
}
