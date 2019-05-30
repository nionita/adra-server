// Simple format of the identifier (number): fill to 11 decimal places
// We do not test what numb contains!
const format = numb => {
  const filled = '0000000000' + numb
  return filled.substring(filled.length - 11)
}

module.exports = {
  format: format
}