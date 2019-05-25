const express = require('express')
const body_parser = require('body-parser')
const cardreader = require('./cardreader')

const app = express()

app.use(body_parser.json())

app.get('/api/read', async (req, res) => {
  console.log('API call: read')
  const read_result = await cardreader.read_block()
  console.log('Read result:', read_result)
  if ('data' in read_result) {
    const data_string = read_result.data.toString('ascii')
    const match = data_string.match(/^ADRA (\d+)$/)
    if (match) {
      const read_ok = { id: Number(match[1]) }
      res.send(JSON.stringify(read_ok))
    } else {
      const read_nok = { message: 'Not the correct block content: ' + data_string }
      res.send(JSON.stringify(read_nok))
    }
  } else {
    res.send(JSON.stringify(read_result))
  }
})

app.post('/api/write', async (req, res) => {
  console.log('API call: write')
  console.log(req.body)
  // const { id } = req.body
  // const data = Buffer.from('ADRA 12345678901', 'utf8')
  // const write_result = await cardreader.write_block(data)
  const write_result = { message: 'aha' }
  // console.log('Read result:', write_result)
  res.send(JSON.stringify(write_result))
})

app.get('/api/readdef', async (req, res) => {
  console.log('API call: readdef')
  const scan_result = await cardreader.read_default()
  console.log('Read result:', scan_result)
  res.send(JSON.stringify(scan_result))
})

app.get('/api/scan', async (req, res) => {
  console.log('API call: scan')
  const scan_result = await cardreader.scan_auth()
  console.log('Read result:', scan_result)
  res.send(JSON.stringify(scan_result))
})

const PORT = process.env.PORT || 5000
app.listen(PORT, () => {
  console.log(`Listening on port`, PORT)
})