import { Message } from 'discord.js'
import mysql, { RowDataPacket } from 'mysql2/promise'

export function getDisplayContent(message: Message) {
  return message.cleanContent.replaceAll(/<:(.+?):([0-9]+?)>/g, ':$1:')
}

export async function existsDBMessage(
  conn: mysql.Connection,
  message: Message
) {
  const [rows] = (await conn.query(
    'SELECT * FROM `message-createds` WHERE msgid = ?',
    [message.id]
  )) as RowDataPacket[][]
  return rows.length !== 0
}
