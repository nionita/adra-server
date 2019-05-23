const keys = require('./config/keys')
const state = require('./state')

const pcsc = require('pcsclite')()

// Application constants
const our_block_number = 4

// Some constants needed in SC communication
// ATR of MIFARE 1k:
const mifare_1k_atr = Buffer.from([0x3B, 0x8F, 0x80, 0x01, 0x80, 0x4F, 0x0C, 0xA0, 0x00, 0x00, 0x03, 0x06, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x6A])

// Different APDU commands:
const cmd_get_UID = Buffer.from([0xFF, 0xCA, 0x00, 0x00, 0x04])
const cmd_get_ATS = Buffer.from([0xFF, 0xCA, 0x01, 0x00, 0x04]) // not supported on MIFARE 1k
// const cmd_load_key = Buffer.from('FF82000006000000000000', 'hex') // we use only one key (location 0); key must be copied to the last 6 bytes of the buffer
const cmd_load_key = Buffer.from('FF82000006FFFFFFFFFFFF', 'hex') // we use only one key (location 0); key must be copied to the last 6 bytes of the buffer
const cmd_auth_a = Buffer.from('FF860000050100006000', 'hex') // authenticate block (position 7) with key type A, key location 0
const cmd_auth_b = Buffer.from('FF860000050100006100', 'hex') // authenticate block (position 7) with key type B, key location 0
const cmd_read = Buffer.from('FFB0000010', 'hex') // read 16 bytes from block (position 3)
// const cmd_write = Buffer.from('FFD600001000000000000000000000000000000000', 'hex') // write 16 bytes in block (position 3); data must be copied to the last 16 bytes of the buffer

// We must write our block number in all commands that involve a block number
function set_block(block_number) {
  cmd_auth_a[7] = block_number
  cmd_auth_b[7] = block_number
  cmd_read[3] = block_number
}

set_block(our_block_number)

// We accept only MIFARE 1k cards for now
function is_mifare_1k(atr) {
  return mifare_1k_atr.compare(atr) === 0
}

// APDU with the PICC: send command, receive response
function APDU(reader, protocol, cmd, next) {
  reader.transmit(cmd, 256, protocol, function(err, data) {
    if (err) {
      console.log('Reader ' + reader.name + ': transmit error:', err)
    } else {
      console.log('Reader ' + reader.name + ': received data:', data)
      next(data)
    }
  });
}

// APDU success/errors
const APDU_SUCCESS = 0
const APDU_ERR_FAILED = 1
const APDU_ERR_NOT_SUPPORTED = 2
const APDU_ERR_UNKNOWN = 3
const APDU_ERR_MESSAGES = [
  'Success', 'Failed', 'Not supported', 'Unknown'
]

function APDU_error(data) {
  const sw1 = data[data.length - 2]
  const sw2 = data[data.length - 1]
  if (sw1 === 0x90 && sw2 === 0x00) {
    return APDU_SUCCESS
  } else if (sw1 === 0x63 && sw2 === 0x00) {
    return APDU_ERR_FAILED
  } else if (sw1 === 0x6A && sw2 === 0x81) {
    return APDU_ERR_NOT_SUPPORTED
  } else {
    return APDU_ERR_UNKNOWN
  }
}

function APDU_payload(data) {
  const payload = data.slice(0, data.length-2)
  return payload
}

function make_auth_key() {
  // Check the secret
  if (!keys.adraSecret || keys.adraSecret.length < 12) {
    console.error('ADRA secret not correct!')
    process.exit(1)
  }
  try {
    const buf_key = Buffer.from(keys.adraSecret, 'hex')
    buf_key.copy(cmd_load_key, 5, 0, 6)
  }
  catch (e) {
    console.error('Cannot create authentication key', e)
    process.exit(1)
  }
}

// Load the auth key - once per server session
function load_auth_key(reader, protocol, next) {
  if (!state.readerHasAuthKey()) {
    console.log('Reader ' + reader.name + ': load authentication key')
    APDU(reader, protocol, cmd_load_key, function(resp) {
      const err = APDU_error(resp)
      if (err === APDU_SUCCESS) {
        state.readerSentAuthKey()
        console.log('Reader ' + reader.name + ': authentication key loaded')
        next()
      } else {
        console.log('Reader ' + reader.name + ': APDU error:', APDU_ERR_MESSAGES[err])
      }
    })
  } else {
    next()
  }
}

function card_inserted(reader) {
  console.log('Reader ' + reader.name + ': card inserted')
  // Card connect options
  const connect_options = { share_mode: reader.SCARD_SHARE_SHARED }
  // const connect_options = { share_mode: reader.SCARD_SHARE_DIRECT }
  reader.connect(connect_options, function(err, protocol) {
    if (err) {
      console.log('Reader ' + reader.name + ': connect error:', err)
    } else {
      console.log('Reader ' + reader.name + ': protocol:', protocol)
      APDU(reader, protocol, cmd_get_UID, function(data) {
        // Check the success of the operation
        const err = APDU_error(data)
        if (err === APDU_SUCCESS) {
          const cuid = APDU_payload(data)
          load_auth_key(reader, protocol, function() {
            state.readerConnected(reader, protocol, cuid)
            console.log('Card UID:', cuid)
          })
        } else {
          console.log('Reader ' + reader.name + ': APDU error:', APDU_ERR_MESSAGES[err])
        }
      })
    }
  })
}

function card_removed(reader) {
  console.log('Reader ' + reader.name + ': card removed')
  state.readerDisconnected()
  reader.disconnect(reader.SCARD_LEAVE_CARD, function(err) {
    if (err) {
      console.log('Reader ' + reader.name + ': disconnect error:', err)
    } else {
      console.log('Reader ' + reader.name + ': disconnected')
    }
  })
}

// make_auth_key()

pcsc.on('reader', function(reader) {
  console.log('New reader detected:', reader.name)

  state.readerNew()

  reader.on('error', function(err) {
    console.log('Reader ' + this.name + ': error:', err.message)
  })

  reader.on('status', function(status) {
    console.log('Reader ' + this.name + ': status:', status.state, 'ATR:', status.atr)
    /* check what has changed */
    var changes = this.state ^ status.state
    if (changes) {
      if ((changes & this.SCARD_STATE_EMPTY) && (status.state & this.SCARD_STATE_EMPTY)) {
        card_removed(reader)
      } else if ((changes & this.SCARD_STATE_PRESENT) && (status.state & this.SCARD_STATE_PRESENT)) {
        if (is_mifare_1k(status.atr)) {
          card_inserted(reader)
        } else {
          console.log('Reader ' + this.name + ': not a MIFARE 1k card')
        }
      }
    }
  })

  reader.on('end', function() {
    console.log('Reader ' + this.name + ': removed')
  })
})

pcsc.on('error', function(err) {
  console.log('PCSC error', err.message)
})

// Interface to access the card: read and write the block 0 of the current card (if any)
function read_block_auth() {
  return new Promise(function(resolve, reject) {
    const { reader, protocol } = state.getROState()
    if (!reader) {
      resolve({ message: 'Reader is not connected or no card present' })
    }
    console.log('Reader ' + reader.name + ': authenticate block', our_block_number)
    APDU(reader, protocol, cmd_auth, function(data) {
      // Check the success of the operation
      const err = APDU_error(data)
      if (err === APDU_SUCCESS) {
        console.log('Reader ' + reader.name + ': read block', our_block_number)
        APDU(reader, protocol, cmd_read, function(data) {
          const err = APDU_error(data)
          if (err === APDU_SUCCESS) {
            const block_data = APDU_payload(data)
            resolve({ data: block_data })
          } else {
            console.log('Reader ' + reader.name + ': APDU error:', APDU_ERR_MESSAGES[err])
            resolve({ message: 'Read - ' + APDU_ERR_MESSAGES[err] })
          }
        })
      } else {
        console.log('Reader ' + reader.name + ': APDU error:', APDU_ERR_MESSAGES[err])
        resolve({ message: 'Authenticate - ' + APDU_ERR_MESSAGES[err] })
      }
    })
  })
}

function APDU_promise(reader, protocol, cmd, block) {
  return new Promise(function(resolve, reject) {
    set_block(block)
    APDU(reader, protocol, cmd, function(data) {
      // Check the success of the operation
      const err = APDU_error(data)
      if (err === APDU_SUCCESS) {
        resolve(true)
      } else {
        resolve(false)
      }
    })
  })
}

function default_sector_auth() {
  return new Promise(async function(resolve, reject) {
    const { reader, protocol } = state.getROState()
    if (!reader) {
      resolve({ message: 'Reader is not connected or no card present' })
    }
    console.log('Find sectors with default auth')
    const key_type = [
      { type: 'A', cmd: cmd_auth_a, sectors: [] },
      { type: 'B', cmd: cmd_auth_b, sectors: [] },
    ]
    for (kt of key_type) {
      console.log('Key type', kt.type)
      for (var sect = 0; sect < 16; sect++) {
        const block = sect * 4
        const ok = await APDU_promise(reader, protocol, kt.cmd, block)
        console.log('Sector', sect, 'block', block, ':', ok)
        if (ok) {
          kt.sectors.append(sect)
        }
      }
    }
    resolve(key_type.map(kt => kt.sectors))
  })
}

function read_block() {
  const { reader, protocol } = state.getROState()
  if (!reader) {
    return { message: 'Reader is not connected or no card present' }
  }
  return new Promise(function(resolve, reject) {
    console.log('Reader ' + reader.name + ': read block 0')
    APDU(reader, protocol, cmd_read, function(data) {
      const err = APDU_error(data)
      if (err === APDU_SUCCESS) {
        const block_data = APDU_payload(data)
        resolve({ data: block_data })
      } else {
        console.log('Reader ' + reader.name + ': APDU error:', APDU_ERR_MESSAGES[err])
        resolve({ message: 'Read - ' + APDU_ERR_MESSAGES[err] })
      }
    })
  })
}

module.exports = {
  // read_block: read_block,
  // read_block: read_block_auth,
  read_block: default_sector_auth,
}