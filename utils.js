export function argToBytes(data) {
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

export function buildDynamicArgs(args = []) {
    return args
        .map(({format = 'hex', value}, index) => ({
            index,
            format,
            value: typeof value !== 'string' ? value?.toString() ?? null : value,
        }))
        .filter(({value = null}) => value !== null)
}

export function argsToSlice(args) {
    if (args?.length === 0) return []
    const maxIndex = Math.max(...args.map(x => x.index))

    const result = new Array(maxIndex).fill(null)

    args.forEach(element => {
        result[element.index] = argToBytes(element)
    })

    return result
}