import childProcess from 'child_process'
import fs from 'fs'
import https from 'https'
import mongoose from 'mongoose'
import schedule from 'node-schedule'
import winston from 'winston'
import { version } from '../../package.json'

// Holds the last commit that was synchronized
let lastCommit  =  ''

let db = {}

db.update = (collection) => {
  let url = `https://raw.githubusercontent.com/cobalt-uoft/datasets/master/${collection}.json`
  https.get(url, res => {
    let filePath = `.cobalt_data/${collection}.json`
    let stream = fs.createWriteStream(filePath, {'flags': 'w'})

    res.on('data', chunk => {
      stream.write(chunk)
    })

    res.on('end', () => {
      stream.end()

      let shell = childProcess.spawn('mongoimport', [
        '-d', mongoose.connection.name,
        '-c', collection,
        '--host', mongoose.connection.host,
        '--port', mongoose.connection.port,
        '--file', filePath,
      ])

      shell.on('close', code => {
        if (code == 0) {
          winston.info(`Synced ${collection}.`)
        } else {
          winston.warn(`Could not import ${collection} to MongoDB. \
            The 'mongoexport' command left us with exit code ${code}.`)
        }
      })

    })

  }).on('error', e => {
    winston.warn('Could not update database, online datasets are \
      currently inaccessible.', e)
  })
}

db.sync = () => {
  db.update('athletics')
  db.update('buildings')
  db.update('courses')
  db.update('exams')
  db.update('food')
  db.update('parking')
  db.update('shuttles')
  db.update('textbooks')
}

db.check = (callback) => {
  let options  =  {
    host: 'api.github.com',
    port: 443,
    path: '/repos/cobalt-uoft/datasets/git/refs/heads/master',
    headers: {'user-agent': `cobalt-uoft/${version}`}
  }

  https.get(options, res  => {
    let data = ''

    res.on('data', chunk => {
      data += chunk
    })

    res.on('end', () => {
      data = JSON.parse(data)

      // Compare the last commit hash to the current one
      if (data.object.sha == lastCommit) return

      lastCommit = data.object.sha

      // Execute the callback
      if (callback) callback()
    })
  })
}

db.syncCron = () => {
  // Make data directory if it doesn't exist
  try {
    fs.statSync('.cobalt_data')
  } catch(e) {
    fs.mkdirSync('.cobalt_data')
  }

  // Perform sync on startup
  db.sync()

  // Schedule checking for sync every hour
  schedule.scheduleJob('0 * * * *', () => {
    db.check(() => { db.sync() })
  })
}

export default db
