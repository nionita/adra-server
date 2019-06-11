# ADRA smart card server

This is a simple smart card server, used locally to quickly identify people
in a web application of the ADRA organization (Mistelbach, Austria).

The server is installed and started on the client PCs independent of the
web application server. The Javascript running in the browser must be
robust in respect to errors which may occur because the adra-server is not
installed or not started.

## Installation

This is a nodejs project, so you will need a node version, which you can install from

https://nodejs.org/

(Currently the server works only with nodejs v10.x.y LTS, so please install that one.)

Then, after cloning the repository locally, go to the directory and type:

npm install

The server needs pcsclite, a node library for PCSC which uses C++ node add-ons.
When installing on Windows, this could make some problems. In this case you might
find this link useful:

https://github.com/Microsoft/nodejs-guidelines/blob/master/windows-environment.md#compiling-native-addon-modules

## Running the server

Currently, running the server a longer time without having a card reader plugged in
is not supported. Best start sequence is:
- plug in the card reader
- start the server

If you must unplug the card reader then, when you need it again, you must restart the server.
Otherwise the card reader will not be recognised by the old server process.

## Smartcards

Currently only cards of type MIFARE Classic 1k are accepted by the server.
Every access to data blocks of these cards must be authenticated with secret keys chosen by the
application designer.

The ADRA server uses the default MIFARE key (0xFFFFFF). This is acceptable, as long as the data written
to the cards is not sensible. If you write sensible data on the cards, you must modify the code
to use a given secret key.

The server uses only one data block of the card, which contains 16 bytes of data. Currently this is
block number 4 (see cardreader.js).

## Server API

Currently the server has 2 APIs:
- the ID API
- the Block API

The ID API handles IDs, which are integers with maximum of 11 decimal places. The block API
handles 16 bytes blocks of arbitrary data.

The ADRA server listens on localhost, port 7200. If you want another port, define the enironment
variable PORT to the wanted value.

### The ID API

The ID API can be reached on the endpoint '/api/id'.

The ID API is very simple, there are 2 operations:
- write an ID to a card
- read the ID from a card.

#### Write an ID to a card

The client must send a POST request to the endpoint 'http://localhost/7200/api/id'. The body of the request must
contain the stringified form of an object like { id: 23456789 }.

If everything is ok, the server responds with { message: 'done' }. Otherwise the message contains the reason
of the error.

#### Read the ID from a card

The client must send a GET request to the endpoint 'http://localhost:7200/api/id'.

If everything is ok, the server responds with an object (in form of JSON) like { id: 12345678 }.
In case of an error, the response is something like { message: 'Reader is not connected or no card present' }.

### The block API

The block API can be reached on the endpoint '/api/block'.

The block API is even simpler than the ID API, it writes and reads 16 bytes of arbitrary data to/from
the card.

#### Write a block to a card

The client must send a POST request to the endpoint 'http://localhost/7200/api/block'. The body of the request must
contain the stringified form of an object like { block: 'data to write 16' }.

If everything is ok, the server responds with { message: 'done' }. Otherwise the message contains the reason
of the error.

#### Read the ID from a card

The client must send a GET request to the endpoint 'http://localhost:7200/api/block'.

If everything is ok, the server responds with an object (in form of JSON) like { block: 'read from block' }.
In case of an error, the response is something like { message: 'Reader is not connected or no card present' }.