const pcsc = require('pcsclite')();

// Some constants needed in SC communication
// ATR of MIFARE 1k:
const mifare_1k_atr = Buffer.from([0x3B, 0x8F, 0x80, 0x01, 0x80, 0x4F, 0x0C, 0xA0, 0x00, 0x00, 0x03, 0x06, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x6A])

// Different APDU commands:
const cmd_get_UID = Buffer.from([0xFF, 0xCA, 0x00, 0x00, 0x04])
const cmd_get_ATS = Buffer.from([0xFF, 0xCA, 0x01, 0x00, 0x04]) // not supported on MIFARE 1k

// Our status
// We assume we have only 1 smartcard reader
var our_state = {
  reader: null, // our reader and protocol, defined only while the card is inserted
  protocol: null,  // (i.e. the reader is connected)
  card_uid: null,
}

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

function card_inserted(reader) {
  console.log('Reader ' + reader.name + ': card inserted');

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
          our_state.reader = reader
          our_state.protocol = protocol
          our_state.card_uid = APDU_payload(data)
          console.log('Card UID:', our_state.card_uid)
        } else {
          console.log('Reader ' + reader.name + ': APDU error:', APDU_ERR_MESSAGES[err])
        }
      })
    }
  });
}

function card_removed(reader) {
  console.log('Reader ' + reader.name + ': card removed');
  our_state.reader = null
  our_state.protocol = null
  // our_state.card_uid = APDU_payload(data) - we leave the UID of the last card (why?)
  reader.disconnect(reader.SCARD_LEAVE_CARD, function(err) {
    if (err) {
      console.log('Reader ' + reader.name + ': disconnect error:', err);
    } else {
      console.log('Reader ' + reader.name + ': disconnected');
    }
  });
}

pcsc.on('reader', function(reader) {
  console.log('New reader detected:', reader.name);

  reader.on('error', function(err) {
    console.log('Reader ' + this.name + ': error:', err.message);
  });

  reader.on('status', function(status) {
    console.log('Reader ' + this.name + ': status:', status.state, 'ATR:', status.atr);
    /* check what has changed */
    var changes = this.state ^ status.state;
    if (changes) {
      if ((changes & this.SCARD_STATE_EMPTY) && (status.state & this.SCARD_STATE_EMPTY)) {
        card_removed(reader);
      } else if ((changes & this.SCARD_STATE_PRESENT) && (status.state & this.SCARD_STATE_PRESENT)) {
        if (is_mifare_1k(status.atr)) {
          card_inserted(reader);
        } else {
          console.log('Reader ' + this.name + ': not a MIFARE 1k card');
        }
      }
    }
  });

  reader.on('end', function() {
    console.log('Reader ' + this.name + ': removed');
  });
});

pcsc.on('error', function(err) {
  console.log('PCSC error', err.message);
});