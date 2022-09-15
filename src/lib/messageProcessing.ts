import mysql from 'mysql2/promise'
import {
    ChannelType,
    FetchMessagesOptions,
    Message,
    NewsChannel,
    Snowflake,
    TextChannel,
    ThreadChannel,
} from 'discord.js'
import os from 'os'
import {check} from './checkData'
import {
    formatDate,
    getDBChannel,
    getDBGuild,
    getDBMessage,
    getDBMessageIds,
    getDBThread,
    getDBUser,
    getDisplayContent,
    isDisabled,
} from './utils'
import Downloader from 'nodejs-file-downloader'
import config from 'config'
import {getClient} from '../main'
import {getDBConnection} from './mysql'

export async function addOldMessages() {
    console.log('Starting to add old messages')
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
            console.log(`Adding old messages from ${channel.name}`)
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
                        if (messageIds.includes(message.id)) continue
                        await newMessage(conn, message, true)
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
    console.log('Finished adding old messages')
}

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
    if (await isDisabled(conn, message)) {
        return
    }

    try {
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
                message.attachments.size > 0
                    ? message.attachments.map((a) => a.url).join(',')
                    : null,
                os.hostname(),
                message.createdAt,
            ]
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

    const oldMessage = await getDBMessage(conn, message.id)
    if (oldMessage === null) {
        await newMessage(conn, message, true)
    }

    if (message.editedAt === null) {
        return
    }

    try {
        await conn.execute(
            'INSERT INTO `message-editeds` (msgid, displaytext, rawtext, attachments, machine, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
            [
                message.id,
                getDisplayContent(message),
                message.content,
                message.attachments.map((a) => a.url).join(','),
                os.hostname(),
                message.editedAt,
            ]
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

    try {
        await conn.execute(
            'INSERT INTO `message-deleteds` (msgid, machine, created_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
            [messageId, os.hostname()]
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

    const message = await getDBMessage(conn, messageId)
    if (message === null) {
        return
    }
    const guild = await getDBGuild(conn, guildId)
    if (guild === null) {
        return
    }
    const user = await getDBUser(conn, String(message.author_id))
    if (user === null) {
        return
    }
    const channel = await getDBChannel(conn, message.channel_id)
    if (channel === null) {
        return
    }
    const thread =
        message.thread_id !== null
            ? await getDBThread(conn, message.thread_id)
            : null

    // jMS Gamers Clubの場合のみ #deleted-messages に投げる
    if (guildId !== '597378876556967936') {
        return
    }
    // botの場合は通知しない
    if (user.bot) {
        return
    }
    const deletedMessageChannelId = config.get<string>('deletedMessageChannel')
    getClient()
        .channels.fetch(deletedMessageChannelId)
        .then(async (c) => {
            if (
                !(
                    c instanceof TextChannel ||
                    c instanceof NewsChannel ||
                    c instanceof ThreadChannel
                )
            ) {
                return
            }
            const attachments =
                message.attachments !== null &&
                message.attachments.split(',').length > 0
                    ? '\n(' + message.attachments.split(',').length + 'ファイル)'
                    : ''
            const userTag = `${user.username}#${user.discriminator}`
            const threadOrChannel =
                message.thread_id !== null && thread !== null
                    ? `<#${message.thread_id}> (\`${thread.name}\` of \`${channel.name}\` in \`${guild.name}\`)`
                    : `<#${message.channel_id}> (\`${channel.name}\` in \`${guild.name}\`)`
            const datetime = formatDate(message.timestamp, 'yyyy/MM/dd HH:mm:ss')
            const content = `\`\`\`${message.rawtext.replaceAll(
                '`',
                '\\`'
            )}\`\`\`${attachments}\n-- at ${datetime} by ${userTag} - ${threadOrChannel}`
            await c.send(content)
        })
}
