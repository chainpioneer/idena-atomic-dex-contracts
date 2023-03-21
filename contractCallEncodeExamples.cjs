const {ContractArgumentFormat} = require("idena-sdk-js");
const {CallContractAttachment} = require("./CallContractAttachment.cjs");
const {getRawTx} = require("./getRawTx.cjs");
const {estimateRawTx} = require("./estimateRawTx.cjs");
const {buildDynamicArgs, argsToSlice} = require("./utils.cjs");

const contractAddress = "0xdfa64FC435298E3C45bd81491055a597B4CaC98E"
const from = "0x473c7B9384EFcd17a929a76E10bF9c3284112347"
const securityDepositAmount = '10.0'
const maxFee = "3"

async function start() {
    const secretHash = '0x43740d4c2e4df17f4aa67589a96ad5508670182c43ef647dbf00f44880aaedf3'

    // const burnRawTx = await getBurnOrderRawTx(secretHash)

    // console.log(txLink(burnRawTx))

    const submitDepositRawTx = await getSubmitSecurityDepositRawTx()

    console.log(txLink(submitDepositRawTx))

    console.log(await estimateRawTx(submitDepositRawTx, from))

    const createRawTx = await getCreateOrderRawTx('100.0', '10.0', 5_856_152, from, secretHash)

    console.log(await estimateRawTx(createRawTx, from))
}

function txLink(rawTx) {
    return `https://app.idena.io/dna/raw?tx=${rawTx}`
}

function getCreateOrderRawTx(dnaAmount, xdaiAmount, deadline, payoutAddress, secretHash) {
    return _rawTx(dnaAmount, _getPayload('createOrder',
        argsToSlice(buildDynamicArgs([
        {
            format: ContractArgumentFormat.Dna,
            index: 0,
            value: xdaiAmount,
        }, {
            format: ContractArgumentFormat.Uint64,
            index: 1,
            value: String(deadline),
        }, {
            format: ContractArgumentFormat.Hex,
            index: 2,
            value: payoutAddress,
        }, {
            format: ContractArgumentFormat.Hex,
            index: 3,
            value: secretHash,
        }
    ]))
    ))
}

function getSubmitSecurityDepositRawTx() {
    return _rawTx(securityDepositAmount, _getPayload('submitSecurityDeposit', []))
}

function getBurnOrderRawTx(secretHash) {
    return _rawTx('0', _getPayload('burnOrder', [{
        format: ContractArgumentFormat.Hex,
        index: 0,
        value: secretHash,
    }]))
}

function _getPayload(method, args) {
    const callArguments = new CallContractAttachment(method, args)
    return `0x${Buffer.from(callArguments.toBytes()).toString('hex')}`
}

function _rawTx(amount, payload) {
    return getRawTx(0x10, from, contractAddress, amount, maxFee, payload)
}



start()
