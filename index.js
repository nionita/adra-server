const express = require('express')
const cardreader = require('./cardreader')

const app = express()

app.get('/api/read', async (req, res) => {
  console.log('API call: read')
  const block_data = await cardreader.read_block()
  console.log('Read result:', block_data)
  res.send(JSON.stringify(block_data))
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