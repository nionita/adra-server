/*
 * This is a simple client to test the smart card server
 * It can:
 * - read the application sector and display it, when no parameter was given
 * - write the given parameter, which must be a number, to the application sector
 * If more than one parameter are given, or if the given parameter is '-h' or '--help',
 * or if the given parameter is not a number, it will display a help text and do nothing else
 *
 * The client works only with the ID API
 * Also it works only with the http protocol (not https), so you must start the server with the option -u
 */

const help = () => {
  console.log('Invocation:')
  console.log()
  console.log('node client.js [-h | --help | <number>]')
  console.log()
  console.log('If no parameter is given, it will read the application block')
  console.log('If a number is given as a parameter, it will write that id in the application block')
  console.log('Otherwise it will display this help text')
}
const http = require('http')

const get_options = {
  port: 7200,
  path: '/api/id',
  method: 'GET'
}

const post_options = {
  port: 7200,
  path: '/api/id',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  }
}

const read = () => {
  let data = ''

  const req = http.request(get_options, res => {
    console.log(`STATUS: ${res.statusCode}`)
    // console.log(`HEADERS: ${JSON.stringify(req.headers)}`)
    res.setEncoding('utf8')

    res.on('data', chunk => {
      console.log(`CHUNK: ${chunk}`)
      data = data + chunk
    })

    res.on('end', () => {
      console.log('Response:', data)
      // We still need to decode an object from the JSON string
    })
  })

  req.on('error', err => {
    console.error(`request problem: ${err}`)
  })

  req.end()
}

const write = my_id => {
  const data = JSON.stringify({ id: my_id })
  post_options.headers['Content-Length'] = Buffer.byteLength(data)

  const req = http.request(post_options, res => {
    console.log(`STATUS: ${res.statusCode}`)
    console.log(`HEADERS: ${JSON.stringify(req.headers)}`)
    res.setEncoding('utf8')

    res.on('data', chunk => {
      console.log(`BODY: ${chunk}`)
    })
    res.on('end', () => {
      console.log('No more data in response')
    })
  })

  req.on('error', err => {
    console.error(`request problem: ${err}`)
  })

  req.write(data)
  req.end()
}

// argv[0] is 'node'
// argv[1] is the script name
// everything else will be our parameters
let operation = 'read'
let param

if (process.argv.length > 3) {
  operation = 'help'
} else if (process.argv.length === 3) {
  param = process.argv[2]
  if (param === '-h' || param === '--help') {
    operation = 'help'
  } else if (/^\d+$/.test(param)) {
    operation = 'write'
    param = Number(param)
  } else {
    operation = 'help'
  }
}

if (operation === 'read') {
  read()
} else if (operation === 'write') {
  write(param)
} else if (operation === 'help') {
  help()
} else {
  console.error('Unknown operation:', operation)
}