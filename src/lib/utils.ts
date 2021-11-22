import {Message} from 'discord.js'
import mysql, {RowDataPacket} from 'mysql2/promise'
import { execSync } from 'child_process'
import {getClient} from "../main";
import axios from "axios";

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

export async function getDBGuild(conn: mysql.Connection, guildId: string) {
  const [rows] = (await conn.query(
      'SELECT * FROM `guilds` WHERE guild_id = ?',
      [guildId]
  )) as RowDataPacket[][]
  return rows.length !== 0 ? rows[0] : null
}

export async function getDBUser(conn: mysql.Connection, userId: string) {
  const [rows] = (await conn.query('SELECT * FROM `users` WHERE user_id = ?', [
    userId,
  ])) as RowDataPacket[][]
  return rows.length !== 0 ? rows[0] : null
}

export async function getDBChannel(conn: mysql.Connection, channelId: string) {
  const [rows] = (await conn.query(
      'SELECT * FROM `channels` WHERE channel_id = ?',
      [channelId]
  )) as RowDataPacket[][]
  return rows.length !== 0 ? rows[0] : null
}

export async function getDBThread(conn: mysql.Connection, threadId: string) {
  const [rows] = (await conn.query(
      'SELECT * FROM `threads` WHERE channel_id = ?',
      [threadId]
  )) as RowDataPacket[][]
  return rows.length !== 0 ? rows[0] : null
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
  const response = await axios.get('https://api.github.com/repos/jaoafa/jaotanChatLogger3/commits/master')
  const json = await response.data
  return json.sha
}

export async function getNowCommitSha(){
  try {
    return execSync('git rev-parse HEAD').toString().trim()
  }catch (e) {
    return null
  }
}

export async function checkNewVersion() {
  const latestCommitSha = await getLatestCommitSha()
  const nowCommitSha = await getNowCommitSha()
  if (latestCommitSha === null || nowCommitSha == null){
    return
  }
  if (latestCommitSha === nowCommitSha) {
    return
  }
  console.log("New version found!")
  console.log("Now: " + nowCommitSha)
  console.log("Latest: " + latestCommitSha)
  try{
    getClient().destroy()
    process.exit(0)
  }catch (e){
    console.log(e)
  }
}