import mysql, { RowDataPacket } from 'mysql2/promise'
import {
  Guild,
  Message,
  NewsChannel,
  TextChannel,
  ThreadChannel,
  User,
} from 'discord.js'

export async function check(conn: mysql.Connection, message: Message) {
  if (
    !(
      message.channel instanceof TextChannel ||
      message.channel instanceof NewsChannel ||
      message.channel instanceof ThreadChannel
    )
  ) {
    return
  }
  await checkExistsGuild(conn, message.guild)
  await checkExistsChannel(
    conn,
    message.channel.isThread() ? message.channel.parent : message.channel
  )
  if (message.channel.isThread()) {
    await checkExistsThread(conn, message.channel)
  }
  await checkExistsUser(conn, message.author)
}

export async function checkExistsGuild(
  conn: mysql.Connection,
  guild: Guild | null
) {
  if (guild === null) {
    throw new Error('guild is null.')
  }
  const [rows] = (await conn.execute(
    'SELECT * FROM guilds WHERE guild_id = ?',
    [guild?.id]
  )) as RowDataPacket[][]
  if (rows.length !== 0) {
    // 既にサーバ情報がDBにある
    return
  }
  console.log(`New guild - Insert row: ${guild.name} (${guild.id})`)
  await conn.execute(
    'INSERT INTO guilds (guild_id, name, created_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
    [guild.id, guild.name]
  )
  await conn.commit()
}

export async function checkExistsChannel(
  conn: mysql.Connection,
  channel: TextChannel | NewsChannel | null
) {
  if (channel === null) {
    throw new Error('channel is null.')
  }
  const [rows] = (await conn.execute(
    'SELECT * FROM channels WHERE channel_id = ?',
    [channel?.id]
  )) as RowDataPacket[][]
  if (rows.length !== 0) {
    // 既にサーバ情報がDBにある
    return
  }
  console.log(`New channel - Insert row: ${channel.name} (${channel.id})`)

  await conn.execute(
    'INSERT INTO channels (channel_id, guild_id, name, created_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)',
    [channel.id, channel.guild.id, channel.name]
  )
  await conn.commit()
}

export async function checkExistsThread(
  conn: mysql.Connection,
  thread: ThreadChannel | null
) {
  if (thread === null) {
    throw new Error('thread is null.')
  }
  const [rows] = (await conn.execute(
    'SELECT * FROM threads WHERE thread_id = ?',
    [thread?.id]
  )) as RowDataPacket[][]
  if (rows.length !== 0) {
    // 既にサーバ情報がDBにある
    return
  }
  console.log(`New thread - Insert row: ${thread.name} (${thread.id})`)

  await conn.execute(
    'INSERT INTO threads (thread_id, guild_id, channel_id, name, created_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)',
    [thread.id, thread.guild.id, thread.parent?.id, thread.name]
  )
  await conn.commit()
}

export async function checkExistsUser(conn: mysql.Connection, author: User) {
  if (author === null) {
    throw new Error('author is null.')
  }
  const [rows] = (await conn.execute('SELECT * FROM users WHERE user_id = ?', [
    author?.id,
  ])) as RowDataPacket[][]
  if (rows.length !== 0) {
    // 既にサーバ情報がDBにある
    return
  }
  console.log(`New author - Insert row: ${author.tag} (${author.id})`)

  await conn.execute(
    'INSERT INTO users (user_id, username, discriminator, bot, `system`, created_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)',
    [
      author.id,
      author.username,
      author.discriminator,
      author.bot,
      author.system,
    ]
  )
  await conn.commit()
}
