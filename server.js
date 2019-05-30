const express = require('express')
const body_parser = require('body-parser')
const idAPI = require('./id-api')
const blockAPI = require('./block-api')

const app = express()

app.use(body_parser.json())
idAPI(app)
blockAPI(app)

const PORT = process.env.PORT || 7200
app.listen(PORT, () => {
  console.log(`ADRA server listening on port`, PORT)
})