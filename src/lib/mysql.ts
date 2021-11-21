import config from 'config'
import mysql from 'mysql2/promise'

export async function getDBConnection(): Promise<mysql.Connection | null> {
  try {
    const connection = await mysql.createConnection({
      host: config.get('mysql.host') as string,
      port: config.get('mysql.port') as number,
      user: config.get('mysql.user') as string,
      password: config.get('mysql.password') as string,
      database: config.get('mysql.database') as string,
      timezone: '+09:00'
    })
    await connection.beginTransaction()

    return connection
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e)
    return null
  }
}
