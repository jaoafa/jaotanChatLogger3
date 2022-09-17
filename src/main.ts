import config from 'config'
import { Client } from 'discord.js'
import { fixOldMessageContents } from './lib/messageProcessing'

const client = new Client({
  intents: ['Guilds', 'GuildMessages', 'MessageContent'],
})

export function getClient() {
  return client
}

client.on('ready', async () => {
  console.log(`ready: ${client.user?.tag}`)

  await fixOldMessageContents()
})

client
  .login(config.get('discordToken'))
  .then(() => console.log('Login Successful.'))
