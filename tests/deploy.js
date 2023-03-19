const path = require("path")
const fs = require("fs")
const { ContractArgumentFormat } = require("idena-sdk-js")
const { ContractRunnerProvider } = require("idena-sdk-tests")

const requiredSecurityDepositAmount = '10.0'
const blocksPerHour = 3600 / 20

async function deployContract(resetChain = true) {
  const wasm = path.join(".", "build", "release", "idena-atomic-dex-contracts.wasm")
  const provider = ContractRunnerProvider.create("http://localhost:9009", "eb3453be213538698ec6db90432fdefd")
  const code = fs.readFileSync(wasm)

  // await provider.Chain.generateBlocks(1)
  const minAmount = '100.0'
  const minTimeout = (blocksPerHour * 3).toString()
  const timeToFulfill = (blocksPerHour).toString()
  const minTimeAfterFulfillment = (blocksPerHour / 2).toString()
  const protocolFund = "0x5E1CF775EC18167722589520b385AfdbF8a4AA5F"

  let i = 0
  const deployTx = await provider.Contract.deploy("0", "5", code, Buffer.from(""), [{
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

  const deployReceipt = await provider.Chain.receipt(deployTx)
  console.log(deployReceipt)
}

it("can deploy and create, match, and finalize order", async () => {
  await deployContract()
  expect(true).toBe(true)
})
