const util = require('util')
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
const cmd_auth = Buffer.from('FF860000050100006000', 'hex') // authenticate block (position 7) with key type A, key location 0
const cmd_read = Buffer.from('FFB0000010', 'hex') // read 16 bytes from block (position 3)
// const cmd_write = Buffer.from('FFD600001000000000000000000000000000000000', 'hex') // write 16 bytes in block (position 3); data must be copied to the last 16 bytes of the buffer

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
        reject(err)
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
  if (keytype === 'B') {
    cmd[8] = 0x61
  } else if (keytype !== 'A') {
    throw('Wrong key type ' + keytype)
  }
  if (keyloc === 1) {
    cmd[9] = 0x01
  } else if (keyloc !== 0) {
    throw('Wrong key location ' + keyloc)
  }
  if (block >= 64) {
    throw('Block too big ' + block)
  }
  cmd[7] = block
  try {
    const data = await APDU(reader, protocol, cmd, debug)
    // Check the success of the operation
    const err = APDU_error(data)
    return err === APDU_SUCCESS
  }
  catch (e) {
    return false
  }
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

function make_auth_key(key) {
  // Check the key
  if (!key || key.length !== 12) {
    throw('Key not correct')
  }
  try {
    const buf_key = Buffer.from(key, 'hex')
    buf_key.copy(cmd_load_key, 5, 0, 6)
  }
  catch (e) {
    throw('Cannot create authentication key:', e)
  }
}

// Load the auth key - once per server session
function load_auth_key(reader, protocol, debug=false) {
  return new Promise((resolve, reject) => {
    if (state.readerHasAuthKey()) {
      resolve()
    } else {
      if (debug) {
        console.log('Reader ' + reader.name + ': load authentication key')
      }
      APDU(reader, protocol, cmd_load_key, debug)
        .then(resp => {
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
        })
        .catch((err) => {
          console.log('Reader ' + reader.name + ': APDU exception:', err)
          reject()
        })
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

// function APDU_promise(reader, protocol, cmd, block) {
//   return new Promise(function(resolve, reject) {
//     set_block(block)
//     APDU(reader, protocol, cmd, function(data) {
//       // Check the success of the operation
//       const err = APDU_error(data)
//       if (err === APDU_SUCCESS) {
//         resolve(true)
//       } else {
//         resolve(false)
//       }
//     })
//   })
// }

function default_sector_auth() {
  return new Promise(async function(resolve, reject) {
    const { reader, protocol } = state.getROState()
    if (!reader) {
      resolve({ message: 'Reader is not connected or no card present' })
    }
    console.log('Find sectors with default auth')
    const sectors = new Set()
    for (var sect = 0; sect < 16; sect++) {
      const block = sect * 4
      var ok = false
      try {
        ok = await APDU_auth(reader, protocol, block)
        console.log('Sector', sect, 'block', block, ':', ok)
      }
      catch (e) {
        console.log('APDU_auth error:', e)
      }
      if (ok) {
        sectors.add(sect)
      }
    }
    resolve(sectors)
  })
}

// Search a correct auth key from a list of default MIFARE keys
function scan_sector_auth() {
  return new Promise(async function(resolve, reject) {
    const { reader, protocol } = state.getROState()
    if (!reader) {
      resolve({ message: 'Reader is not connected or no card present' })
    }
    console.log('Find sectors with default mifare auth keys')
    const dmkeys = require('./mifare_keys')
    const found = {}
    for (key of dmkeys) {
      var key_ok = true
      try {
        make_auth_key(key)
      }
      catch (e) {
        console.log('Key', key, 'error:', e)
        key_ok = false
      }
      if (key_ok) {
        console.log('Key', key)
        // Prepare to load the new key
        state.readerNew()
        await load_auth_key(reader, protocol)
        const sectors = []
        for (var sect = 0; sect < 16; sect++) {
          // Only the first block from every sector
          const block = sect * 4 + 3
          var ok = false
          try {
            ok = await APDU_auth(reader, protocol, block, 'B')
            console.log('Sector', sect, 'block', block, ':', ok)
          }
          catch (e) {
            console.log('APDU_auth error:', e)
          }
          if (ok) {
            sectors.append(sect)
          }
        }
        if (sectors.length > 0) {
          found['key'] = []
        }
      }
    }
    resolve(found)
  })
}

module.exports = {
  // read_block: read_block,
  read_block: read_block_auth,
  read_default: default_sector_auth,
  scan_auth: scan_sector_auth,
}