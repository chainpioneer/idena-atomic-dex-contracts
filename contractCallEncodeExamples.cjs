const {ContractArgumentFormat} = require("idena-sdk-js");
const {CallContractAttachment} = require("./CallContractAttachment.cjs");
const {getRawTx} = require("./getRawTx.cjs");

async function start() {
    const amount = "100.0"
    const maxFee = "3"
    const method = "createOrder"
    const payoutAddress = "0x473c7B9384EFcd17a929a76E10bF9c3284112347"
    const contractAddress = "0xdfa64FC435298E3C45bd81491055a597B4CaC98E"
    const secretHash = '0x43740d4c2e4df17f4aa67589a96ad5508670182c43ef647dbf00f44880aaedf3'
    const args = [{
        format: ContractArgumentFormat.Dna,
        index: 0,
        value: '10.0',
    }, {
        format: ContractArgumentFormat.Uint64,
        index: 1,
        value: String(200),
    }, {
        format: ContractArgumentFormat.Hex,
        index: 2,
        value: payoutAddress,
    }, {
        format: ContractArgumentFormat.Hex,
        index: 3,
        value: secretHash,
    }]

    const callArguments = new CallContractAttachment(method, args, 3)
    const payload = `0x${Buffer.from(callArguments.toBytes()).toString('hex')}`
    console.log(payload)

    const rawTx = await getRawTx(0x10, payoutAddress, contractAddress, amount, maxFee, payload)

    console.log(rawTx)
}

start()
