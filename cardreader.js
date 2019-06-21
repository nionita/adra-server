// const keys = require('./config/keys')
const state = require('./state')
const pcsc = require('pcsclite')()

// Application constants

// Use only 1 block to write/read the member id
const our_block_number = 4

// Some constants needed in SC communication
// ATR of MIFARE 1k:
const mifare_1k_atr = Buffer.from([0x3B, 0x8F, 0x80, 0x01, 0x80, 0x4F, 0x0C, 0xA0, 0x00, 0x00, 0x03, 0x06, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x6A])

// Different APDU commands:
const cmd_get_UID = Buffer.from('FFCA000004', 'hex')
const cmd_load_key = Buffer.from('FF82000006FFFFFFFFFFFF', 'hex') // we use only one key (location 0); key must be copied to the last 6 bytes of the buffer
const cmd_auth = Buffer.from('FF860000050100006000', 'hex') // authenticate block (position 7) with key type A, key location 0
const cmd_read = Buffer.from('FFB0000010', 'hex') // read 16 bytes from block (position 3)
const cmd_write = Buffer.from('FFD6000010', 'hex') // write 16 bytes in block (position 3); data buffer must be concatenated at the end

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

// We accept only MIFARE 1k cards for now
function is_mifare_1k(atr) {
  return mifare_1k_atr.compare(atr) === 0
}

// APDU with the PICC: send command, receive response
function APDU(reader, protocol, cmd, debug=false) {
  return new Promise((resolve, reject) => {
    reader.transmit(cmd, 256, protocol, function(err, data) {
      if (err) {
        console.log('Reader ' + reader.name + ': transmit error:', err)
        reject('transmit error: ' + err)
      } else {
        if (debug) {
          console.log('Reader ' + reader.name + ': received data:', data)
        }
        resolve(data)
      }
    })
  })
}

async function APDU_auth(reader, protocol, block, keytype='A', keyloc=0, debug=false) {
  const cmd = Buffer.from(cmd_auth)
  if (block >= 64) {
    throw 'Auth: block number too big ' + block
  }
  cmd[7] = block
  if (keytype === 'B') {
    cmd[8] = 0x61
  } else if (keytype !== 'A') {
    throw 'Auth: wrong key type ' + keytype
  }
  if (keyloc === 1) {
    cmd[9] = 0x01
  } else if (keyloc !== 0) {
    throw 'Auth: wrong key location ' + keyloc
  }
  let data
  try {
    data = await APDU(reader, protocol, cmd, debug)
  }
  catch (e) {
    throw 'Auth: ' + e
  }
  // Check the success of the operation
  const err = APDU_error(data)
  if (err !== APDU_SUCCESS) {
    throw 'Auth error: ' + APDU_ERR_MESSAGES[err]
  }
}

async function APDU_read(reader, protocol, block, debug=false) {
  const cmd = Buffer.from(cmd_read)
  if (block >= 64) {
    throw 'Read: block number too big ' + block
  }
  cmd[3] = block
  let data
  try {
    data = await APDU(reader, protocol, cmd, debug)
  }
  catch (e) {
    throw 'Read: ' + e
  }
  // Check the success of the operation
  const err = APDU_error(data)
  if (err !== APDU_SUCCESS) {
    throw 'Read error: ' + APDU_ERR_MESSAGES[err]
  }
  return APDU_payload(data)
}

async function APDU_write(reader, protocol, block, data, debug=false) {
  const cmd = Buffer.concat([cmd_write, data], 21)
  if (block >= 64) {
    throw 'Write: block number too big ' + block
  }
  cmd[3] = block
  let res
  try {
    res = await APDU(reader, protocol, cmd, debug)
  }
  catch (e) {
    throw 'Write: ' + e
  }
  // Check the success of the operation
  const err = APDU_error(res)
  if (err !== APDU_SUCCESS) {
    throw 'Write error: ' + APDU_ERR_MESSAGES[err]
  }
}

function make_auth_key(key) {
  // Check the key
  if (!key || key.length !== 12) {
    throw 'Make auth key: incorrect key specification'
  }
  try {
    const buf_key = Buffer.from(key, 'hex')
    buf_key.copy(cmd_load_key, 5, 0, 6)
  }
  catch (e) {
    throw 'Make auth key: cannot create authentication key: ' + e
  }
}

// Load the auth key - once per server session
function load_auth_key(reader, protocol, debug=false) {
  return new Promise(async (resolve, reject) => {
    if (state.readerHasAuthKey()) {
      resolve()
    } else {
      if (debug) {
        console.log('Reader ' + reader.name + ': load authentication key')
      }
      try {
        const resp = await APDU(reader, protocol, cmd_load_key, debug)
        const err = APDU_error(resp)
        if (err === APDU_SUCCESS) {
          state.readerSentAuthKey()
          if (debug) {
            console.log('Reader ' + reader.name + ': authentication key loaded')
          }
          resolve()
        } else {
          console.log('Reader ' + reader.name + ': APDU error:', APDU_ERR_MESSAGES[err])
          reject()
        }
      }
      catch (e) {
        reject()
      }
    }
  })
}

function card_inserted(reader) {
  console.log('Reader ' + reader.name + ': card inserted')
  // Card connect options
  const connect_options = { share_mode: reader.SCARD_SHARE_SHARED }
  // const connect_options = { share_mode: reader.SCARD_SHARE_DIRECT }
  reader.connect(connect_options, async function(err, protocol) {
    if (err) {
      console.log('Reader ' + reader.name + ': connect error:', err)
    } else {
      console.log('Reader ' + reader.name + ': protocol:', protocol)
      try {
        const data = await APDU(reader, protocol, cmd_get_UID)
        // Check the success of the operation
        const err = APDU_error(data)
        if (err === APDU_SUCCESS) {
          const cuid = APDU_payload(data)
          await load_auth_key(reader, protocol)
          state.readerConnected(reader, protocol, cuid)
          console.log('Card UID:', cuid)
        } else {
          console.log('Reader ' + reader.name + ': APDU error:', APDU_ERR_MESSAGES[err])
        }
      }
      catch (e) {
        console.log('Reader ' + reader.name + ': connect error:', e)
      }
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
    // check what has changed
    let changes = this.state ^ status.state
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
function auth_read_block(debug=false) {
  return new Promise(async (resolve, reject) => {
    const { reader, protocol } = state.getROState()
    if (!reader) {
      resolve({ message: 'Reader is not connected or no card present' })
    }
    if (debug) {
      console.log('Reader ' + reader.name + ': authenticate block', our_block_number)
    }
    try {
      // Currently we always authenticate a block before we read
      // But MIFARE needs authentication only if the sector changes
      // We could use an internal state with last authenticated sector
      // and then authenticate only when needed
      await APDU_auth(reader, protocol, our_block_number)
      if (debug) {
        console.log('Reader ' + reader.name + ': read block', our_block_number)
      }
      const data = await APDU_read(reader, protocol, our_block_number)
      resolve({ data })
    }
    catch (e) {
      resolve({ message: e })
    }
  })
}

function auth_write_block(data, debug=false) {
  return new Promise(async (resolve, reject) => {
    const { reader, protocol } = state.getROState()
    if (!reader) {
      resolve({ message: 'Reader is not connected or no card present' })
    }
    if (debug) {
      console.log('Reader ' + reader.name + ': authenticate block', our_block_number)
    }
    try {
      // Currently we always authenticate a block before we write
      // But MIFARE needs authentication only if the sector changes
      // We could use an internal state with last authenticated sector
      // and then authenticate only when needed
      await APDU_auth(reader, protocol, our_block_number)
      if (debug) {
        console.log('Reader ' + reader.name + ': write block', our_block_number)
      }
      await APDU_write(reader, protocol, our_block_number, data)
      resolve({ message: 'done' })
    }
    catch (e) {
      resolve({ message: e })
    }
  })
}

module.exports = {
  read_block: auth_read_block,
  write_block: auth_write_block,
}