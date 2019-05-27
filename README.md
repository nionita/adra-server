# ADRA smart card server

This is a simple smart card server, used locally to quickly identify people
in a web application of the ADRA organization (Mistelbach, Austria).

The server is installed and started on the client PCs independent of the
web application server. The Javascript running in the browser must be
robust in respect to errors which may occur because the adra-server is not
installed or not started.

## Installation

This is a nodejs project, so you will need a node version, which you cat install from

https://nodejs.org/

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

If you must plug out the card reader, when you plug in again, you must stop and restart the server.
Otherwise the card reader will not be recognised by the old server process.

## Server API

The API is very simple, there are 2 operations:
- write an ID to a card
- read the ID from a card.

Currently only cards of type MIFARE Classic 1k are accepted by the server.
Every access to data blocks of these cards must be authenticated with secret keys chosen by the
application designer.

The ADRA server uses the default MIFARE key (0xFFFFFF). This is acceptable, as long the data written
to the cards is not sensible. If you write sensible data on the cards, you must modify the code
to use a given secret key.

### Write an ID to a card

The client must send a GET request to the endpoint 'http://localhost:5000/api/read'.

If everything is ok, the server responds with an object (in form of JSON) like { id: 12345678 }.
In case of an error, the response is something like { message: 'Reader is not connected or no card present' }.

The server uses only one data block of the card, which contains 16 bytes of data. Please see server.js
for the format of the data block. The ID must be an integer and can have maximal 11 decimal places.

### Read the ID from a card

The client must send a POST request to the endpoint 'http://localhost/5000/'. The body of the request must
contain the stringified form of an object like { id: 23456789 }.

If everything is ok, the server responds with { message: 'done' }. Otherwise the message contains the reason
of the error.