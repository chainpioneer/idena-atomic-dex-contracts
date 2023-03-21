const axios = require('axios')

async function getRawTx(
    type,
    from,
    to,
    amount,
    maxFee,
    payload,
    tips,
) {
    const {data} = await axios.post('http://localhost:9009', {
        method: 'bcn_getRawTx',
        params: [
            strip({
                type,
                from,
                to,
                amount,
                maxFee,
                payload,
                tips,
                useProto: true,
            }),
        ],
        id: 1,
        key:"eb3453be213538698ec6db90432fdefd",
    })
    const {result, error} = data
    if (error) throw new Error(error.message)
    return result
}

function strip(obj) {
    // eslint-disable-next-line no-param-reassign
    Object.keys(obj).forEach(key => !obj[key] && delete obj[key])
    return obj
}

module.exports = { getRawTx }