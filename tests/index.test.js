const path = require("path")
const fs = require("fs")
const { randomBytes } = require('crypto')
const keccak256 = require('keccak256')
const { ContractArgumentFormat } = require("idena-sdk-js")
const { ContractRunnerProvider } = require("idena-sdk-tests")

const requiredSecurityDepositAmount = '10.0'
const blocksPerHour = 3600 / 20

async function deployContract(resetChain = true) {
  const wasm = path.join(".", "build", "release", "idena-atomic-dex-contracts.wasm")
  const provider = ContractRunnerProvider.create("http://localhost:3333", "")
  const code = fs.readFileSync(wasm)

  if (resetChain) {
    await provider.Chain.generateBlocks(1)
    await provider.Chain.resetTo(2)
  }

  // await provider.Chain.generateBlocks(1)
  const minAmount = '100.0'
  const minTimeout = (blocksPerHour * 3).toString()
  const timeToFulfill = (blocksPerHour).toString()
  const minTimeAfterFulfillment = (blocksPerHour / 2).toString()
  const protocolFund = "0x0000000000000000000000000000000000000001"

  let i = 0
  const deployTx = await provider.Contract.deploy("0", "9999", code, Buffer.from(""), [{
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
  expect(deployReceipt.success).toBe(true)
  return { provider: provider, contract: deployReceipt.contract }
}

async function ensureMapValueIsNil(provider, contract, map, key) {
  try {
    await provider.Contract.readMap(contract, map, key, "hex")
    expect(true).toBe(false)
  } catch (e) {
    expect(String(e)).toBe('Error: data is nil')
  }
}

it("can deploy and create, match, and finalize order", async () => {
  let { provider, contract } = await deployContract()


  // Create order

  const payoutAddress = "0x0000000000000000000000000000000000000001"

  const secret = randomBytes(512)
  const secretHash = `0x${keccak256(secret).toString('hex')}`

  const createOrderTx = await provider.Contract.call(
    contract,
    "createOrder",
    "1000.0",
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

  expect(createOrderReceipt.events[0].event).toBe('Order created')
  expect(createOrderReceipt.events[0].args[0]).toBe(secretHash)

  const god = await provider.Chain.godAddress()
  expect(await provider.Contract.readMap(contract, "getOwner", secretHash, "hex")).toBe(god)

  await ensureMapValueIsNil(provider, contract, "getMatcher", secretHash)

  expect(await provider.Contract.readMap(contract, "getAmountDNA", secretHash, "dna")).toBe('1000')
  expect(await provider.Contract.readMap(contract, "getAmountXDAI", secretHash, "dna")).toBe('1000')
  expect(await provider.Contract.readMap(contract, "getExpirationBlock", secretHash, "uint64")).toBe(2000)
  expect(await provider.Contract.readMap(contract, "getPayoutAddresses", secretHash, "address")).toBe(payoutAddress)

  const balanceAfterCreatingOrder = await provider.Chain.balance(createOrderReceipt.events[0].contract)
  expect(balanceAfterCreatingOrder).toBe('1000')


  // Submit security deposit

  const depositTx = await provider.Contract.call(
      contract,
      "submitSecurityDeposit",
      requiredSecurityDepositAmount,
      "9999",
      []
  )

  await provider.Chain.generateBlocks(1)

  const depositTxReceipt = await provider.Chain.receipt(depositTx)

  expect(depositTxReceipt.events[0].event).toBe('Security deposit submitted')
  expect(depositTxReceipt.events[0].args[0]).toBe(god)

  const balanceAfterSecurityDeposit = await provider.Chain.balance(depositTxReceipt.events[0].contract)
  expect(balanceAfterSecurityDeposit).toBe('1010')


  // Match order

  const matchOrderTx = await provider.Contract.call(
      contract,
      "matchOrder",
      "0",
      "9999",
      [{
        format: ContractArgumentFormat.Hex,
        index: 0,
        value: secretHash,
      }]
  )

  await provider.Chain.generateBlocks(1)

  const matchOrderTxReceipt = await provider.Chain.receipt(matchOrderTx)

  expect(matchOrderTxReceipt.events[0].event).toBe('Order matched')
  expect(matchOrderTxReceipt.events[0].args[0]).toBe(secretHash)
  expect(await provider.Contract.readMap(contract, "getMatcher", secretHash, "address")).toBe(god)
  // expect(await provider.Contract.readMap(contract, "isDepositInUse", god, "bool")).toBe(true)
  expect(await provider.Contract.readMap(contract, "getMatchExpirationBlock", secretHash, "uint64")).toBe(blocksPerHour + 6)

  /// GNOSIS interactions
  // `matchOrder` (secretHash, amountXDAI, owner payoutAddress)

  // owner - side
  // `completeOrder(secret)`

  // Complete order

  const completeOrderTx = await provider.Contract.call(
      contract,
      "completeOrder",
      "0",
      "9999",
      [{
        format: ContractArgumentFormat.Hex,
        index: 0,
        value: `0x${secret.toString('hex')}`,
      }]
  )

  await provider.Chain.generateBlocks(1)
  const completeOrderTxReceipt = await provider.Chain.receipt(completeOrderTx)
  expect(completeOrderTxReceipt.events[0].event).toBe('Order completed')
  expect(completeOrderTxReceipt.events[0].args[0]).toBe(secretHash)

  await ensureMapValueIsNil(provider, contract, "getMatcher", secretHash)
  await ensureMapValueIsNil(provider, contract, "getOwner", secretHash)
  await ensureMapValueIsNil(provider, contract, "getPayoutAddresses", secretHash)
  await ensureMapValueIsNil(provider, contract, "getPayoutAddress", secretHash)
  await ensureMapValueIsNil(provider, contract, "getAmountDNA", secretHash)
  await ensureMapValueIsNil(provider, contract, "getAmountXDAI", secretHash)
  await ensureMapValueIsNil(provider, contract, "getExpirationBlock", secretHash)
  await ensureMapValueIsNil(provider, contract, "getMatchExpirationBlock", secretHash)
  await ensureMapValueIsNil(provider, contract, "isDepositInUse", secretHash)

  expect(await provider.Chain.balance(depositTxReceipt.events[0].contract)).toBe('10')


  // Withdraw security deposit

  const withdrawSecurityDepositTx = await provider.Contract.call(
      contract,
      "withdrawSecurityDeposit",
      "0",
      "9999",
      []
  )

  await provider.Chain.generateBlocks(1)

  const withdrawSecurityDepositTxReceipt = await provider.Chain.receipt(withdrawSecurityDepositTx)
  expect(withdrawSecurityDepositTxReceipt.events[0].event).toBe('Security deposit withdrawn')
  expect(withdrawSecurityDepositTxReceipt.events[0].args[0]).toBe(god)

  await ensureMapValueIsNil(provider, contract, "isDepositInUse", god)

  expect(await provider.Chain.balance(depositTxReceipt.events[0].contract)).toBe('0')
})
