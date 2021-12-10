import {
  Message,
  NewsChannel,
  Snowflake,
  TextChannel,
  ThreadChannel,
} from 'discord.js'
import mysql, { RowDataPacket } from 'mysql2/promise'
import { execSync } from 'child_process'
import { getClient } from '../main'
import axios from 'axios'

export function getDisplayContent(message: Message) {
  return message.cleanContent.replaceAll(/<:(.+?):([0-9]+?)>/g, ':$1:')
}

export async function getDBMessage(conn: mysql.Connection, messageId: string) {
  const [rows] = (await conn.query(
    'SELECT * FROM `message-createds` WHERE msgid = ?',
    [messageId]
  )) as RowDataPacket[][]
  return rows.length !== 0 ? rows[0] : null
}

export async function getDBGuild(
  conn: mysql.Connection,
  guildId: Snowflake | undefined
) {
  if (guildId === undefined) {
    return null
  }
  const [rows] = (await conn.query(
    'SELECT * FROM `guilds` WHERE guild_id = ?',
    [guildId]
  )) as RowDataPacket[][]
  return rows.length !== 0 ? rows[0] : null
}

export async function getDBUser(
  conn: mysql.Connection,
  userId: string | undefined
) {
  if (userId === undefined) {
    return null
  }
  const [rows] = (await conn.query('SELECT * FROM `users` WHERE user_id = ?', [
    userId,
  ])) as RowDataPacket[][]
  return rows.length !== 0 ? rows[0] : null
}

export async function getDBChannel(
  conn: mysql.Connection,
  channelId: string | undefined
) {
  if (channelId === undefined) {
    return null
  }
  const [rows] = (await conn.query(
    'SELECT * FROM `channels` WHERE channel_id = ?',
    [channelId]
  )) as RowDataPacket[][]
  return rows.length !== 0 ? rows[0] : null
}

export async function getDBThread(
  conn: mysql.Connection,
  threadId: string | undefined
) {
  if (threadId === undefined) {
    return null
  }
  const [rows] = (await conn.query(
    'SELECT * FROM `threads` WHERE thread_id = ?',
    [threadId]
  )) as RowDataPacket[][]
  return rows.length !== 0 ? rows[0] : null
}

export async function isDisabled(
  conn: mysql.Connection,
  message: Message
): Promise<boolean> {
  if (
    !(
      message.channel instanceof TextChannel ||
      message.channel instanceof NewsChannel ||
      message.channel instanceof ThreadChannel
    )
  ) {
    return false
  }
  const guild = await getDBGuild(conn, message.guild?.id)
  if (guild !== null && guild.disabled) {
    console.log('isDisabled: Guild:' + message.guild?.name + ' is disabled')
    return true
  }
  const channel = await getDBChannel(
    conn,
    message.channel.isThread() ? message.channel.parent?.id : message.channelId
  )
  if (channel !== null && channel.disabled) {
    console.log(
      '-> isDisabled: Channel:' +
        (message.channel.isThread()
          ? message.channel.parent?.name
          : message.channel.name) +
        ' is disabled'
    )
    return true
  }
  if (message.channel.isThread()) {
    const thread = await getDBThread(conn, message.channelId)
    if (thread !== null && thread.disabled) {
      console.log(
        '-> isDisabled: Thread:' + message.channel.name + ' is disabled'
      )
      return true
    }
  }
  const user = await getDBUser(conn, message.author.id)
  if (user !== null && user.disabled) {
    console.log('-> isDisabled: User:' + message.author.tag + ' is disabled')
    return true
  }
  return false
}

export function formatDate(date: Date, format: string): string {
  format = format.replace(/yyyy/g, String(date.getFullYear()))
  format = format.replace(/MM/g, ('0' + (date.getMonth() + 1)).slice(-2))
  format = format.replace(/dd/g, ('0' + date.getDate()).slice(-2))
  format = format.replace(/HH/g, ('0' + date.getHours()).slice(-2))
  format = format.replace(/mm/g, ('0' + date.getMinutes()).slice(-2))
  format = format.replace(/ss/g, ('0' + date.getSeconds()).slice(-2))
  format = format.replace(/SSS/g, ('00' + date.getMilliseconds()).slice(-3))
  return format
}

export async function getLatestCommitSha(): Promise<string> {
  const response = await axios.get(
    'https://api.github.com/repos/jaoafa/jaotanChatLogger3/commits/master'
  )
  const json = await response.data
  return json.sha
}

export async function getNowCommitSha() {
  try {
    return execSync('git rev-parse HEAD').toString().trim()
  } catch (e) {
    return null
  }
}

export async function checkNewVersion() {
  const latestCommitSha = await getLatestCommitSha()
  const nowCommitSha = await getNowCommitSha()
  if (latestCommitSha === null || nowCommitSha == null) {
    return
  }
  if (latestCommitSha === nowCommitSha) {
    return
  }
  console.log('New version found!')
  console.log('Now: ' + nowCommitSha)
  console.log('Latest: ' + latestCommitSha)
  try {
    getClient().destroy()
    process.exit(0)
  } catch (e) {
    console.log(e)
  }
}
