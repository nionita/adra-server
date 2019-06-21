/*
 * The ID API deals with IDs (numbers) of up to 11 digits
 * The block will have the format:
 *
 * ADRA 12345678901
 *
 * This will be enforced by write and checked by read
 */

const cors = require('cors')
const { format } = require('./utils')

module.exports = (app, cardreader) => {
  // Todo: allow only configured origins!
  app.get('/api/id', cors(), async (req, res) => {
    // console.log('API call: read')
    const read_result = await cardreader.read_block()
    console.log('Read result:', read_result)
    if ('data' in read_result) {
      const data_string = read_result.data.toString('ascii')
      const match = data_string.match(/^ADRA (\d+)$/)
      if (match) {
        res.json({ id: Number(match[1]) })
      } else {
        res.json({ message: 'Not the correct block content: ' + data_string })
      }
    } else {
      res.json(read_result)
    }
  })

  // Enable pre-flight request for POST
  // Todo: allow only configured origins!
  app.options('/api/id', cors())

  // Todo: allow only configured origins!
  app.post('/api/id', cors(), async (req, res) => {
    // console.log('API call: write')
    // console.log(req.body)
    const { id } = req.body
    let write_result
    // id must be a number, otherwise is an error
    if (id + 0 == id) {
      console.log('Want to write id', id)
      const formatted = 'ADRA ' + format(id)
      const data = Buffer.from(formatted, 'utf8')
      write_result = await cardreader.write_block(data)
      console.log('Write result:', write_result)
    } else {
      write_result = { message: 'Given id must be a number' }
    }
    res.json(write_result)
  })
}