import mysql from 'mysql2/promise'
import {
  Message,
  NewsChannel,
  Snowflake,
  TextChannel,
  ThreadChannel,
} from 'discord.js'
import os from 'os'
import { check } from './checkData'
import { existsDBMessage, getDisplayContent } from './utils'
import Downloader from 'nodejs-file-downloader'
import config from 'config'

// --------------- メッセージ処理 --------------- //

/**
 * メッセージが投稿された場合に処理する
 *
 * @param conn DBコネクション
 * @param message メッセージ
 * @param past データベースにメッセージがないために作成する場合は true (過去メッセージとして)
 */
export async function newMessage(
  conn: mysql.Connection,
  message: Message,
  past = false
): Promise<void> {
  if (
    !(
      message.channel instanceof TextChannel ||
      message.channel instanceof NewsChannel ||
      message.channel instanceof ThreadChannel
    )
  ) {
    return
  }
  console.log(
    `New message${past ? '(past)' : ''}: ${message.cleanContent.substring(
      0,
      10
    )} by ${message.author.tag} (${message.id}) in ${message.channel.name} (${
      message.channelId
    })`
  )

  await check(conn, message)

  await conn.execute(
    'INSERT INTO `message-createds` (msgid, displaytext, rawtext, guild_id, channel_id, thread_id, author_id, type, attachments, machine, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      message.id,
      getDisplayContent(message),
      message.content,
      message.guild?.id,
      message.channel.isThread()
        ? message.channel.parent?.id
        : message.channelId,
      message.channel.isThread() ? message.channelId : null,
      message.author.id,
      message.type,
      message.attachments.map((a) => a.url).join(','),
      os.hostname(),
      message.createdTimestamp,
    ]
  )
  await conn.commit()

  message.attachments.forEach((attachment) => {
    const downloader = new Downloader({
      url: attachment.url,
      directory: `${
        config.has('attachments_dir')
          ? config.get('attachments_dir')
          : 'attachments'
      }/${message.guildId}/${message.channelId}/${message.id}`,
      onProgress: function (percentage, _chunk, remainingSize) {
        console.log(`${percentage}% - Remaining bytes: ${remainingSize}`)
      },
    })
    try {
      downloader.download()
    } catch (error) {
      console.log(error)
    }
  })
}

/**
 * メッセージが編集された場合に処理する
 *
 * @param conn DBコネクション
 * @param message メッセージ
 */
export async function editedMessage(
  conn: mysql.Connection,
  message: Message
): Promise<void> {
  if (
    !(
      message.channel instanceof TextChannel ||
      message.channel instanceof NewsChannel ||
      message.channel instanceof ThreadChannel
    )
  ) {
    return
  }
  console.log(
    `Edited message: ${message.cleanContent.substring(0, 10)} by ${
      message.author.tag
    } (${message.id}) in ${message.channel.name} (${message.channelId})`
  )

  await check(conn, message)

  if (!(await existsDBMessage(conn, message))) {
    await newMessage(conn, message, true)
  }

  await conn.execute(
    'INSERT INTO `message-editeds` (msgid, displaytext, rawtext, attachments, machine, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
    [
      message.id,
      getDisplayContent(message),
      message.content,
      message.attachments.map((a) => a.url).join(','),
      os.hostname(),
      message.createdTimestamp,
    ]
  )
  await conn.commit()
}

/**
 * メッセージが削除された場合に処理する
 *
 * @param conn DBコネクション
 * @param guildId Guild ID
 * @param channelId Channel ID
 * @param messageId Message ID
 */
export async function deletedMessage(
  conn: mysql.Connection,
  guildId: Snowflake,
  channelId: Snowflake,
  messageId: Snowflake
) {
  console.log(
    `Deleted message: Guild#${guildId} Channel#${channelId} Message#${messageId}`
  )

  await conn
    .execute(
      'INSERT INTO `message-deleteds` (msgid, machine, created_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
      [messageId, os.hostname()]
    )
    .catch(() => null)
  await conn.commit()
}
