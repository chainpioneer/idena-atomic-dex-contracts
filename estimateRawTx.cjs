const axios = require('axios')

async function estimateRawTx(rawTx, from) {
    const {data} = await axios.post('https://restricted.idena.io', {
        method: 'bcn_estimateRawTx',
        params: [rawTx, from],
        id: 1,
        key: "idena-restricted-node-key",
    })
    const {result, error} = data
    if (error) throw new Error(error.message)
    return result
}

module.exports = { estimateRawTx }