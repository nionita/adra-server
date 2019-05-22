// Our state - we assume we have only 1 smartcard reader
var our_state = {
  reader: null, // our reader and protocol, defined only while the card is inserted
  protocol: null,  // (i.e. the reader is connected)
  card_uid: null,
}

module.exports = {
  readerConnected(reader, protocol, card_uid) {
    our_state.reader = reader
    our_state.protocol = protocol
    our_state.card_uid = card_uid
  },
  readerDisconnected() {
    our_state.reader = null
    our_state.protocol = null
  },
  getROState() {
    return {...our_state}
  }
}