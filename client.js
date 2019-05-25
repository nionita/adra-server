const http = require('http')

const get_options = {
  port: 5000,
  path: '/api/read',
  method: 'GET'
}

const post_options = {
  port: 5000,
  path: '/api/write',
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

read()
// write(123456)