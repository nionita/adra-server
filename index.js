const express = require('express')
const cardreader = require('./cardreader')

const app = express()

app.get('/api/read', (req, res) => {
  console.log('API call: read')
  res.send('this is the data')
})

const PORT = process.env.PORT || 5000
app.listen(PORT, () => {
  console.log(`Listening on port`, PORT)
})