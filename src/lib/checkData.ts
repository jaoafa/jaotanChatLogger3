import {
  Guild,
  GuildAuditLogs,
  Message,
  NewsChannel,
  TextChannel,
  ThreadChannel,
  User,
  AuditLogEvent,
  ForumChannel,
} from 'discord.js'
import mysql, { ResultSetHeader } from 'mysql2/promise'
import { getDBChannel, getDBGuild, getDBThread, getDBUser } from './utils'

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
  await checkRenamedGuild(conn, message.guild)
  await checkExistsChannel(
    conn,
    message.channel.isThread() ? message.channel.parent : message.channel,
  )
  await checkRenamedChannel(
    conn,
    message.channel.isThread() ? message.channel.parent : message.channel,
  )
  if (message.channel.isThread()) {
    await checkExistsThread(conn, message.channel)
    await checkRenamedThread(conn, message.channel)
  }
  await checkExistsUser(conn, message.author)
  await checkModifiedUser(conn, message.author)
}

/**
 * Guildがデータベースにあるかを確認し、なければ作成します。
 *
 * @param conn データベースコネクション
 * @param guild チェックするGuild
 */
async function checkExistsGuild(conn: mysql.Connection, guild: Guild | null) {
  if (guild === null) {
    throw new Error('guild is null.')
  }
  if ((await getDBGuild(conn, guild.id)) !== null) {
    return
  }
  console.log(`New guild - Insert row: ${guild.name} (${guild.id})`)
  await conn
    .execute(
      'INSERT INTO guilds (guild_id, name, created_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
      [guild.id, guild.name],
    )
    .catch(() => null)
  await conn.commit()
}

/**
 * Guildの名前が変更されていないかを確認し、変更されていればデータベースの記録も変更します。
 *
 * @param conn データベースコネクション
 * @param guild Guild
 */
async function checkRenamedGuild(conn: mysql.Connection, guild: Guild | null) {
  if (guild === null) {
    throw new Error('guild is null.')
  }
  const dbGuild = await getDBGuild(conn, guild.id)
  if (dbGuild === null) {
    return
  }
  if (dbGuild.name === guild.name) {
    return
  }
  console.log(
    `Renamed guild - Update row: ${dbGuild.name} -> ${guild.name} (${guild.id})`,
  )
  try {
    const result = (await conn.execute(
      'UPDATE guilds SET name = ? WHERE guild_id = ? AND name != ?',
      [guild.name, guild.id, guild.name],
    )) as unknown as ResultSetHeader[]
    if (result[0].affectedRows === 0) {
      console.log('-> The Guild name change has already been recorded.')
      return
    }
    await conn.commit()
  } catch (e) {
    console.log('-> The Guild name change has already been recorded.')
  }
  let changeLog = null
  try {
    const log = await guild.fetchAuditLogs({
      type: AuditLogEvent.GuildUpdate,
      limit: 5,
    })
    changeLog = await getNameChanged(conn, log)
  } catch (e) {}
  await conn
    .execute(
      'INSERT INTO `name-changes` (id, old_name, new_name, changed_by, type, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
      [
        guild.id,
        dbGuild.name,
        guild.name,
        changeLog ? changeLog.changedBy : null,
        'GUILD_NAME',
        changeLog ? changeLog.timestamp : null,
      ],
    )
    .catch(() => null)
  await conn.commit()
}

/**
 * チャンネルがデータベースにあるかを確認し、なければ作成します。
 *
 * @param conn データベースコネクション
 * @param channel チェックするチャンネル
 */
async function checkExistsChannel(
  conn: mysql.Connection,
  channel: TextChannel | NewsChannel | ForumChannel | null,
) {
  if (channel === null) {
    throw new Error('channel is null.')
  }
  if ((await getDBChannel(conn, channel.id)) !== null) {
    return
  }
  console.log(`New channel - Insert row: ${channel.name} (${channel.id})`)

  await conn
    .execute(
      'INSERT INTO channels (channel_id, guild_id, name, created_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)',
      [channel.id, channel.guild.id, channel.name],
    )
    .catch(() => null)
  await conn.commit()
}

/**
 * チャンネルの名前が変更されていないかを確認し、変更されていればデータベースの記録も変更します。
 *
 * @param conn データベースコネクション
 * @param channel チャンネル
 */
async function checkRenamedChannel(
  conn: mysql.Connection,
  channel: TextChannel | NewsChannel | ForumChannel | null,
) {
  if (channel === null) {
    throw new Error('channel is null.')
  }
  const dbChannel = await getDBChannel(conn, channel.id)
  if (dbChannel === null) {
    return
  }
  if (dbChannel.name === channel.name) {
    return
  }
  console.log(
    `Renamed channel - Update row: ${dbChannel.name} -> ${channel.name} (${channel.id})`,
  )
  try {
    const result = (await conn.execute(
      'UPDATE channels SET name = ? WHERE channel_id = ? AND name != ?',
      [channel.name, channel.id, channel.name],
    )) as unknown as ResultSetHeader[]
    if (result[0].affectedRows === 0) {
      console.log('-> The channel name change has already been recorded.')
      return
    }
    await conn.commit()
  } catch (e) {
    console.log('-> The channel name change has already been recorded.')
  }
  let changeLog = null
  try {
    const log = await channel.guild.fetchAuditLogs({
      type: AuditLogEvent.ChannelUpdate,
      limit: 5,
    })
    changeLog = await getNameChanged(conn, log)
  } catch (e) {}
  await conn
    .execute(
      'INSERT INTO `name-changes` (id, old_name, new_name, changed_by, type, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
      [
        channel.id,
        dbChannel.name,
        channel.name,
        changeLog ? changeLog.changedBy : null,
        'CHANNEL_NAME',
        changeLog ? changeLog.timestamp : null,
      ],
    )
    .catch(() => null)
  await conn.commit()
}

/**
 * スレッドがデータベースにあるかを確認し、なければ作成します。
 *
 * @param conn データベースコネクション
 * @param thread チェックするスレッド
 */
async function checkExistsThread(
  conn: mysql.Connection,
  thread: ThreadChannel | null,
) {
  if (thread === null) {
    throw new Error('thread is null.')
  }
  if ((await getDBThread(conn, thread.id)) !== null) {
    return
  }
  console.log(`New thread - Insert row: ${thread.name} (${thread.id})`)

  await conn
    .execute(
      'INSERT INTO threads (thread_id, guild_id, channel_id, name, created_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)',
      [thread.id, thread.guild.id, thread.parent?.id, thread.name],
    )
    .catch(() => null)
  await conn.commit()
}

/**
 * スレッドの名前が変更されていないかを確認し、変更されていればデータベースの記録も変更します。
 *
 * @param conn データベースコネクション
 * @param thread スレッド
 */
async function checkRenamedThread(
  conn: mysql.Connection,
  thread: ThreadChannel | null,
) {
  if (thread === null) {
    throw new Error('thread is null.')
  }
  const dbThread = await getDBThread(conn, thread.id)
  if (dbThread === null) {
    return
  }
  if (dbThread.name === thread.name) {
    return
  }
  console.log(
    `Renamed thread - Update row: ${dbThread.name} -> ${thread.name} (${thread.id})`,
  )
  try {
    const result = (await conn.execute(
      'UPDATE threads SET name = ? WHERE thread_id = ? AND name != ?',
      [thread.name, thread.id, thread.name],
    )) as unknown as ResultSetHeader[]
    if (result[0].affectedRows === 0) {
      console.log('-> The thread name change has already been recorded.')
      return
    }
    await conn.commit()
  } catch (e) {
    console.log('-> The thread name change has already been recorded.')
  }
  let changeLog = null
  try {
    const log = await thread.guild.fetchAuditLogs({
      type: AuditLogEvent.ThreadUpdate,
      limit: 5,
    })
    changeLog = await getNameChanged(conn, log)
  } catch (e) {}
  await conn
    .execute(
      'INSERT INTO `name-changes` (id, old_name, new_name, changed_by, type, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
      [
        thread.id,
        dbThread.name,
        thread.name,
        changeLog ? changeLog.changedBy : null,
        'THREAD_NAME',
        changeLog ? changeLog.timestamp : null,
      ],
    )
    .catch(() => null)
  await conn.commit()
}

/**
 * ユーザがデータベースにあるかを確認し、なければ作成します。
 *
 * @param conn データベースコネクション
 * @param user チェックするユーザ
 */
async function checkExistsUser(conn: mysql.Connection, user: User) {
  if (user === null) {
    throw new Error('author is null.')
  }
  if ((await getDBUser(conn, user.id)) !== null) {
    return
  }
  console.log(`New user - Insert row: ${user.tag} (${user.id})`)

  await conn
    .execute(
      'INSERT INTO users (user_id, username, discriminator, bot, `system`, created_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)',
      [user.id, user.username, user.discriminator, user.bot, user.system],
    )
    .catch(() => null)
  await conn.commit()
}

/**
 * ユーザの情報が変更されていないかを確認し、変更されていればデータベースの記録も変更します。
 *
 * @param conn データベースコネクション
 * @param user ユーザ
 */
async function checkModifiedUser(conn: mysql.Connection, user: User) {
  if (user === null) {
    throw new Error('user is null.')
  }
  const dbUser = await getDBUser(conn, user.id)
  if (dbUser === null) {
    return
  }
  let changed = false
  if (dbUser.username !== user.username) {
    console.log(
      `Modified user:username - Update row: ${dbUser.username} -> ${user.username} (${user.id})`,
    )
    changed = true
  }
  if (dbUser.discriminator !== user.discriminator) {
    console.log(
      `Modified user:discriminator - Update row: ${dbUser.discriminator} -> ${user.discriminator} (${user.id})`,
    )
    changed = true
  }
  if (!changed) {
    return
  }

  try {
    const result = (await conn.execute(
      'UPDATE users SET username = ?, discriminator = ? WHERE user_id = ? AND (username != ? OR discriminator != ?)',
      [
        user.username,
        user.discriminator,
        user.id,
        user.username,
        user.discriminator,
      ],
    )) as unknown as ResultSetHeader[]
    if (result[0].affectedRows === 0) {
      console.log('-> The username / user tag changes are already recorded.')
      return
    }
    await conn.commit()
  } catch (e) {
    console.log('-> The username / user tag changes are already recorded.')
  }
  if (dbUser.username !== user.username) {
    await conn
      .execute(
        'INSERT INTO `name-changes` (id, old_name, new_name, changed_by, type, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
        [user.id, dbUser.username, user.username, null, 'USER_NAME', null],
      )
      .catch(() => null)
  }
  if (dbUser.discriminator !== user.discriminator) {
    await conn
      .execute(
        'INSERT INTO `name-changes` (id, old_name, new_name, changed_by, type, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
        [
          user.id,
          dbUser.discriminator,
          user.discriminator,
          null,
          'USER_DISCRIMINATOR',
          null,
        ],
      )
      .catch(() => null)
  }
  await conn.commit()
}

async function getNameChanged(
  conn: mysql.Connection,
  log:
    | GuildAuditLogs<AuditLogEvent.GuildUpdate>
    | GuildAuditLogs<AuditLogEvent.ChannelUpdate>
    | GuildAuditLogs<AuditLogEvent.ThreadUpdate>,
) {
  let changedBy = null
  let timestamp = null
  for (const entry of log.entries.values()) {
    if (entry !== null && entry?.executor != null) {
      if (
        entry.changes?.find((change) => change.key === 'name') === undefined
      ) {
        continue
      }
      await checkExistsUser(conn, entry.executor)
      changedBy = entry.executor.id
      timestamp = entry.createdAt
      break
    }
  }
  return {
    changedBy,
    timestamp,
  }
}
