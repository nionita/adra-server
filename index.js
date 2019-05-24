const express = require('express')
const cardreader = require('./cardreader')

const app = express()

app.get('/api/read', async (req, res) => {
  console.log('API call: read')
  const read_result = await cardreader.read_block()
  console.log('Read result:', read_result)
  res.send(JSON.stringify(read_result))
})

app.post('/api/write', async (req, res) => {
  console.log('API call: read')
  // const { id } = req.body
  const data = Buffer.from('ADRA 12345678901', 'utf8')
  const write_result = await cardreader.write_block(data)
  console.log('Read result:', write_result)
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