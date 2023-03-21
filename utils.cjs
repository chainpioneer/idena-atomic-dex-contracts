const BN = require('bn.js')
const Decimal = require('decimal.js')
const DNA_BASE = '1000000000000000000'

Decimal.set({toExpPos: 10000})

function argToBytes(data) {
    try {
        switch (data.format) {
            case 'byte': {
                const val = parseInt(data.value, 10)
                if (val >= 0 && val <= 255) {
                    return [val]
                }
                throw new Error('invalid byte value')
            }
            case 'int8': {
                const val = parseInt(data.value, 10)
                if (val >= 0 && val <= 255) {
                    return [val]
                }
                throw new Error('invalid int8 value')
            }
            case 'uint64': {
                const res = new BN(data.value)
                if (res.isNeg()) throw new Error('invalid uint64 value')
                const arr = res.toArray('le')
                return [...arr, ...new Array(8).fill(0)].slice(0, 8)
            }
            case 'int64': {
                const arr = new BN(data.value).toArray('le')
                return [...arr, ...new Array(8).fill(0)].slice(0, 8)
            }
            case 'string': {
                return [...Buffer.from(data.value, 'utf8')]
            }
            case 'bigint': {
                return new BN(data.value).toArray()
            }
            case 'hex': {
                return [...hexToUint8Array(data.value)]
            }
            case 'dna': {
                return new BN(
                    new Decimal(data.value).mul(new Decimal(DNA_BASE)).toString()
                ).toArray()
            }
            default: {
                return [...hexToUint8Array(data.value)]
            }
        }
    } catch (e) {
        throw new Error(
            `cannot parse ${data.format} at index ${data.index}: ${e.message}`
        )
    }
}

function hexToUint8Array(hexString) {
    const str = stripHexPrefix(hexString)

    const arrayBuffer = new Uint8Array(str.length / 2)

    for (let i = 0; i < str.length; i += 2) {
        const byteValue = parseInt(str.substr(i, 2), 16)
        arrayBuffer[i / 2] = byteValue
    }

    return arrayBuffer
}

function buildDynamicArgs(args = []) {
    return args
        .map(({format = 'hex', value}, index) => ({
            index,
            format,
            value: typeof value !== 'string' ? value?.toString() ?? null : value,
        }))
        .filter(({value = null}) => value !== null)
}

function argsToSlice(args) {
    if (args?.length === 0) return []
    const maxIndex = Math.max(...args.map(x => x.index))

    const result = new Array(maxIndex).fill(null)

    args.forEach(element => {
        result[element.index] = argToBytes(element)
    })

    return result
}

function stripHexPrefix(str) {
    if (typeof str !== 'string') {
        return str
    }
    return isHexPrefixed(str) ? str.slice(2) : str
}

function isHexPrefixed(str) {
    return str.slice(0, 2) === '0x'
}

function toHexString(byteArray, withPrefix) {
    return (
        (withPrefix ? '0x' : '') +
        Array.from(byteArray, function(byte) {
            // eslint-disable-next-line no-bitwise
            return `0${(byte & 0xff).toString(16)}`.slice(-2)
        }).join('')
    )
}

module.exports = { argsToSlice, buildDynamicArgs, hexToUint8Array, toHexString }