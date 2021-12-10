import config from 'config'
import {
  Client,
  Collection,
  Intents,
  Message,
  PartialMessage,
  Snowflake,
  TextChannel,
  ThreadChannel,
} from 'discord.js'
import { getDBConnection } from './lib/mysql'
import {
  deletedMessage,
  editedMessage,
  newMessage,
} from './lib/messageProcessing'
import { checkNewVersion } from './lib/utils'

const client = new Client({
  intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES],
})

export function getClient() {
  return client
}

// ready: ログインの完了時 -> アクティブなすべてのスレッドに参加
client.on('ready', async () => {
  console.log(`ready: ${client.user?.tag}`)

  client.guilds.cache.forEach((guild) => {
    guild.channels.cache.forEach((channel) => {
      if (!(channel instanceof ThreadChannel)) {
        return
      }
      if (channel.joined) {
        return
      }
      console.log(
        `Join new thread: ${channel.name} (${channel.id}) in ${guild.name} (${guild.id})`
      )
      channel.join()
    })
  })

  setInterval(async () => {
    await checkNewVersion()
  }, 1000 * 60 * 60)
})

// message: メッセージが送信・受信された時 -> DBに新規メッセージデータを追加
client.on('messageCreate', async (message: Message) => {
  const conn = await getDBConnection()
  if (conn === null) {
    return
  }
  await newMessage(conn, message)
  conn.destroy()
})

client.on(
  'messageUpdate',
  async (
    _old: Message | PartialMessage,
    newMessage: Message | PartialMessage
  ) => {
    const conn = await getDBConnection()
    if (conn === null) {
      return
    }
    await editedMessage(
      conn,
      newMessage.partial ? await newMessage.fetch() : newMessage
    )
    conn.destroy()
  }
)

// raw(MESSAGE_DELETE): メッセージが削除されたとき -> DBにメッセージ削除データを追加
client.on('raw', async (raw) => {
  if (raw.t === 'MESSAGE_DELETE') {
    const conn = await getDBConnection()
    if (conn === null) {
      return
    }
    const guildId = raw.d.guild_id
    const channelId = raw.d.channel_id
    const messageId = raw.d.id
    await deletedMessage(conn, guildId, channelId, messageId)
    conn.destroy()
  }

  if (raw.t === 'MESSAGE_UPDATE') {
    const conn = await getDBConnection()
    if (conn === null) {
      return
    }
    const channelId = raw.d.channel_id
    const channel = (await client.channels.fetch(channelId)) as TextChannel
    if (channel == null) {
      return
    }
    const message = await channel.messages.fetch(raw.d.id)
    if (message == null) {
      return
    }

    await editedMessage(conn, message)
    conn.destroy()
  }
})

// threadCreate: スレッドが作成された場合にそのスレッドに参加する
client.on('threadCreate', async (thread: ThreadChannel) => {
  if (!thread.joined) {
    return
  }
  if (thread.archived) {
    return
  }
  await thread.join()
})

// threadUpdate: スレッドが更新された場合に、そのスレッドに参加していなかった場合は参加する
client.on('threadUpdate', async (thread: ThreadChannel) => {
  if (!thread.joined) {
    return
  }
  if (thread.archived) {
    return
  }
  await thread.join().catch(() => null)
})

// threadListSync: スレッドリストが変更された場合に、そのスレッドに参加していなかった場合は参加する
client.on(
  'threadListSync',
  async (threads: Collection<Snowflake, ThreadChannel>) => {
    threads.forEach((thread: ThreadChannel) => {
      if (!thread.joined) {
        return
      }
      if (thread.archived) {
        return
      }
      thread.join().catch(() => null)
    })
  }
)

client
  .login(config.get('discordToken'))
  .then(() => console.log('Login Successful.'))
