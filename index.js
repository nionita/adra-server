const express = require('express')
const cardreader = require('./cardreader')

const app = express()

app.get('/api/read', async (req, res) => {
  console.log('API call: read')
  const block_data = await cardreader.read_block()
  console.log('Read result:', block_data)
  res.send(JSON.stringify(block_data))
})

const PORT = process.env.PORT || 5000
app.listen(PORT, () => {
  console.log(`Listening on port`, PORT)
})