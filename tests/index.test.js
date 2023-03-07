const path = require("path")
const fs = require("fs")
const { randomBytes } = require('crypto')
const keccak256 = require('keccak256')
const { toHexString, hexToUint8Array } = require("idena-sdk-js")

const {
  ContractRunnerProvider,
  ContractArgumentFormat,
} = require("idena-sdk-tests")

async function deployContract(resetChain = true) {
  const wasm = path.join(".", "build", "release", "idena-atomic-dex-contracts.wasm")
  const provider = ContractRunnerProvider.create("http://localhost:3333", "")
  const code = fs.readFileSync(wasm)

  if (resetChain) {
    await provider.Chain.generateBlocks(1)
    await provider.Chain.resetTo(2)
  }

  // await provider.Chain.generateBlocks(1)

  const requiredSecurityDepositAmount = '10.0'
  const minAmount = '100.0'
  const blocksPerHour = 3600 / 20
  const minTimeout = String(blocksPerHour * 3)
  const timeToFulfill = String(blocksPerHour)
  const minTimeAfterFulfillment = String(blocksPerHour / 2)
  const protocolFund = "0x0000000000000000000000000000000000000001"

  let i = 0
  const deployTx = await provider.Contract.deploy("99999", "9999", code, Buffer.from(""), [{
    index: i++,
    format: ContractArgumentFormat.Dna,
    value: requiredSecurityDepositAmount,
  }, {
    index: i++,
    format: ContractArgumentFormat.Dna,
    value: minAmount,
  }, {
    index: i++,
    format: ContractArgumentFormat.Uint64,
    value: minTimeout,
  }, {
    index: i++,
    format: ContractArgumentFormat.Uint64,
    value: timeToFulfill,
  }, {
    index: i++,
    format: ContractArgumentFormat.Uint64,
    value: minTimeAfterFulfillment,
  }, {
    index: i++,
    format: ContractArgumentFormat.Hex,
    value: protocolFund,
  }])

  await provider.Chain.generateBlocks(1)

  const deployReceipt = await provider.Chain.receipt(deployTx)
  // console.log(deployReceipt.events)
  expect(deployReceipt.success).toBe(true)
  return { provider: provider, contract: deployReceipt.contract }
}

it("can deploy and transfer tokens", async () => {
  let { provider, contract } = await deployContract()

  const payoutAddress = "0x0000000000000000000000000000000000000001"

  const secret = randomBytes(512)
  const secretHash = `0x${keccak256(secret).toString('hex')}`

  const createOrderTx = await provider.Contract.call(
    contract,
    "createOrder",
    "1000",
    "9999",
    [{
      format: ContractArgumentFormat.Dna,
      index: 0,
      value: '1000.0',
    },{
      format: ContractArgumentFormat.Uint64,
      index: 1,
      value: '2000',
    },{
      format: ContractArgumentFormat.Hex,
      index: 2,
      value: payoutAddress,
    },{
      format: ContractArgumentFormat.Hex,
      index: 3,
      value: secretHash,
    }]
  )

  await provider.Chain.generateBlocks(1)

  const createOrderReceipt = await provider.Chain.receipt(createOrderTx)

  console.log(createOrderReceipt.events)

  expect(createOrderReceipt.events[0].args[0]).toBe(secretHash)

  console.log('request')

  const order = await provider.Contract.readMap(
    contract,
    "o:",
    secretHash,
    "hex"
  )

  console.log(order)

  const data = hexToUint8Array(order)

  console.log(toHexString(data))

})
