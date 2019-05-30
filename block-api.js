/*
 * The block API deals with strings which occupy exactly 16 bytes when UTF-8 encoded
 */

const cors = require('cors')
const cardreader = require('./cardreader')

module.exports = app => {
  // Todo: allow only configured origins!
  app.get('/api/block', cors(), async (req, res) => {
    // console.log('API call: read')
    const read_result = await cardreader.read_block()
    console.log('Read result:', read_result)
    if ('data' in read_result) {
      const data_string = read_result.data.toString('utf8')
      res.json({ block: data_string })
    } else {
      res.json(read_result)
    }
  })

  // Enable pre-flight request for POST
  // Todo: allow only configured origins!
  app.options('/api/block', cors())

  // Todo: allow only configured origins!
  app.post('/api/block', cors(), async (req, res) => {
    // console.log('API call: write')
    // console.log(req.body)
    const { block } = req.body
    let write_result
    // block must be a UTF-8 string which occupies exctly 16 bytes, otherwise is an error
    const data = Buffer.from(block, 'utf8')
    if (data.length === 16) {
      console.log('Want to write block', block)
      write_result = await cardreader.write_block(data)
      console.log('Write result:', write_result)
    } else {
      write_result = { message: 'Given block has wrong length' }
    }
    res.json(write_result)
  })
}