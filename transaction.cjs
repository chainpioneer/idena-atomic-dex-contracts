const messages = require('./models_pb.cjs')
const BN = require('bn.js')
const {hexToUint8Array, toHexString} = require("./utils.cjs");

class Transaction {
    constructor(nonce, epoch, type, to, amount, maxFee, tips, payload) {
        this.nonce = nonce || 0
        this.epoch = epoch || 0
        this.type = type || 0
        this.to = to
        this.amount = amount || 0
        this.maxFee = maxFee || 0
        this.tips = tips || 0
        this.payload = payload
        this.signature = null
    }

    fromHex(hex) {
        return this.fromBytes(hexToUint8Array(hex))
    }

    fromBytes(bytes) {
        const protoTx = messages.ProtoTransaction.deserializeBinary(bytes)

        const protoTxData = protoTx.getData()
        this.nonce = protoTxData.getNonce()
        this.epoch = protoTxData.getEpoch()
        this.type = protoTxData.getType()
        this.to =
            protoTxData.getTo() && protoTxData.getTo()?.length > 0
                ? toHexString(protoTxData.getTo(), true)
                : null
        this.amount = new BN(protoTxData.getAmount())
        this.maxFee = new BN(protoTxData.getMaxfee())
        this.tips = new BN(protoTxData.getTips())
        this.payload = protoTxData.getPayload()

        this.signature = protoTx.getSignature()

        return this
    }
}

module.exports = { Transaction }