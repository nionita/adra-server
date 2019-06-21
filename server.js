/*
 * The server can run either on http or https
 * Default is https
 * To run it on http, start it with the option -u
 */

let err = false
let proto = 'https'

// argv[0] is 'node'
// argv[1] is the script name
// everything else will be our parameters
if (process.argv.length > 3) {
  console.error('Too many parameters')
  err = true
} else if (process.argv.length === 3) {
  if (process.argv[2] === '-u') {
    proto = 'http'
  } else {
    console.error('Only option -u is acceptable')
    err = true
  }
}

if (!err) {
  const express = require('express')
  const body_parser = require('body-parser')
  const idAPI = require('./id-api')
  const blockAPI = require('./block-api')

  const app = express()

  app.use(body_parser.json())
  idAPI(app)
  blockAPI(app)

  const PORT = process.env.PORT || 7200
  let server

  if (proto === 'https') {
    const fs = require('fs')
    const https = require('https')
    server = https.createServer({
      key: fs.readFileSync('./security/client.local.key'),
      cert: fs.readFileSync('./security/client.local.crt')
    }, app)
  } else {
    server = app
  }

  // Start the server
  server.listen(PORT, () => {
    console.log(`ADRA server listening on ${proto} port`, PORT)
  })
}