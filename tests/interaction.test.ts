const { ContractArgumentFormat, DnaProvider, BcnProvider, ContractProvider } = require("idena-sdk-js")
const { ContractRunnerProvider } = require("idena-sdk-tests")
const {randomBytes} = require("crypto");
const keccak256 = require("keccak256");
const BN = require("bn.js");

const bcnProvider = BcnProvider.create("https://restricted.idena.io", "idena-restricted-node-key")
const dnaProvider = DnaProvider.create("https://restricted.idena.io", "idena-restricted-node-key")
const contractRunnerProvider = ContractRunnerProvider.create("http://localhost:9009", "eb3453be213538698ec6db90432fdefd")
const contractAddress = '0xE23369534EfBfbc1E51f028DAe5f412CCCe1ccA9'

it("test calls", async () => {
    const payoutAddress = "0x473c7B9384EFcd17a929a76E10bF9c3284112347"

    const secret = randomBytes(512)

    console.log(secret.toString('hex'))

    const secretHash = '0x43740d4c2e4df17f4aa67589a96ad5508670182c43ef647dbf00f44880aaedf3' //`0x${keccak256(secret).toString('hex')}`

    console.log('secretHash', secretHash)

    const blockNumber = await bcnProvider.lastBlock()

    console.log(blockNumber)

    const deadline = Number(blockNumber.height) + 600

    const createOrderTx = await contractRunnerProvider.Contract.estimateCall(
        contractAddress,
        "createOrder",
        "100.0",
        "3",
        [{
            format: ContractArgumentFormat.Dna,
            index: 0,
            value: '10.0',
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
        }]
    )

    console.log(createOrderTx)

    console.log(await getBalance('0x0000000000000000000000000000000000000000'))

    console.log(await getActiveOrders())

    console.log(await getOrderState(secretHash))

    // console.log(await getCommonParameters())

    // console.log(createOrderTx)

    // const receipt = await provider.Chain.receipt(createOrderTx)
    // console.log(receipt)

})

async function getBalance(account) {
    const balance = await dnaProvider.balance(account)
    return balance.balance
}

async function getOrderState(secretHash) {
    const [
        owner,
        payoutAddress,
        amountDNA,
        amountXDAI,
        expirationBlock,
        matcher,
        matchExpirationBlock,
    ] = await Promise.all([
        tryReadMap(contractAddress, 'getOwner', secretHash, 'address'),
        tryReadMap(contractAddress, 'getPayoutAddresses',secretHash,  'address'),
        tryReadMap(contractAddress, 'getAmountDNA',secretHash,  'dna'),
        tryReadMap(contractAddress, 'getAmountXDAI',secretHash,  'dna'),
        tryReadMap(contractAddress, 'getExpirationBlock', secretHash, 'uint64'),
        tryReadMap(contractAddress, 'getMatcher',secretHash,  'address'),
        tryReadMap(contractAddress, 'getMatchExpirationBlock',secretHash,  'uint64'),
    ])

    return {
        owner,
        payoutAddress,
        amountDNA,
        amountXDAI,
        expirationBlock,
        matcher,
        matchExpirationBlock,
    }
}

// async function getCommonParameters() {
//     const [
//         minAmount,
//         minOrderTTLInBlocks,
//         fulfillPeriodInBlocks,
//         gapAfterFulfillment,
//         requiredSecurityDepositAmount,
//     ] = await Promise.all([
//         contractRunnerProvider.Contract.readData(contractAddress, 'minAmount', 'dna'),
//         contractRunnerProvider.Contract.readData(contractAddress, 'minOrderTTLInBlocks', 'uint64'),
//         contractRunnerProvider.Contract.readData(contractAddress, 'fulfillPeriodInBlocks', 'uint64'),
//         contractRunnerProvider.Contract.readData(contractAddress, 'gapAfterFulfillment', 'uint64'),
//         contractRunnerProvider.Contract.readData(contractAddress, 'requiredSecurityDepositAmount', 'dna'),
//     ])
//
//     return {
//         minAmount,
//         minOrderTTLInBlocks,
//         fulfillPeriodInBlocks,
//         gapAfterFulfillment,
//         requiredSecurityDepositAmount,
//     }
// }

async function tryReadMap(contractAddress, method, key, type) {
    try {
        return await contractRunnerProvider.Contract.readMap(contractAddress, method, key, type)
    } catch (e) {
        return null
    }
}

async function readMap(contract, map, key) {
    try {
        return await contractRunnerProvider.Contract.readMap(contract, map, key, "hex")
    } catch (e) {
        return null
    }
}

async function getActiveOrders() {
    const results = []
    let i = 0
    let current
    while (current = await readMap(contractAddress, "activeOrders", numToHex(i++))) {
        results.push(current)
    }
    return results
}

function numToHex(num) {
    const arr = new BN(num).toArray('le')
    return `0x${Buffer.from([...arr, ...new Array(4).fill(0)].slice(0, 4)).toString('hex')}`
}
