const pcsc = require('pcsclite')();

const readCmd = Buffer.from([0x00, 0xB0, 0x00, 0x00, 0x20]);

function read_data(reader, protocol, next) {
  reader.transmit(readCmd, 40, protocol, function(err, data) {
    if (err) {
      console.log('Reader ' + reader.name + ': transmit error:', err);
    } else {
      console.log('Reader ' + reader.name + ': received data:', data);
      next()
    }
  });
}

function card_inserted(reader) {
  console.log('Reader ' + reader.name + ': card inserted');
  reader.connect({ share_mode : this.SCARD_SHARE_SHARED }, function(err, protocol) {
    if (err) {
      console.log('Reader ' + reader.name + ': connect error:', err);
    } else {
      console.log('Reader ' + reader.name + ': protocol:', protocol);
      read_data(reader, protocol, function() {
        reader.close();
        pcsc.close();
      });
    }
  });
}

function card_removed(reader) {
  console.log('Reader ' + reader.name + ': card removed');
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
        card_inserted(reader);
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