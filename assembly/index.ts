import {
  Address,
  Balance,
  Bytes,
  Context,
  Host,
  PersistentMap,
  KeyValue,
} from "idena-sdk-as"

export class AtomicDex {
  owner: Address
  minAmount: Balance
  minOrderTTLInBlocks: u64
  fulfillPeriodInBlocks: u64

  activeOrderCount : KeyValue<string, i32>

  activeOrders: PersistentMap<i32, Bytes>

  requiredSecurityDepositAmount: Balance

  protocolFund: Address

  // security deposit data
  securityDeposits: PersistentMap<Address, Balance>
  securityDepositInUse: PersistentMap<Address, bool>

  // order fields
  orderIndex: PersistentMap<Bytes, i32>
  payoutAddresses: PersistentMap<Bytes, Address>
  orderOwners: PersistentMap<Bytes, Address>
  amountsDNA: PersistentMap<Bytes, Balance>
  amountsXDAI: PersistentMap<Bytes, Balance>
  expirationBlocks: PersistentMap<Bytes, u64>
  matchers: PersistentMap<Bytes, Address>
  matchExpirationBlocks: PersistentMap<Bytes, u64>

  constructor(
      requiredSecurityDepositAmount: Balance,
      minAmount: Balance,
      minOrderTTLInBlocks: u64,
      fulfillPeriodInBlocks: u64,
      protocolFund: Address,
  ) {

    this.activeOrderCount = new KeyValue<string, i32>("activeOrderCount")
    this.activeOrderCount.set(0)
    this.activeOrders = PersistentMap.withStringPrefix<i32, Bytes>("activeOrders")

    // order data
    this.orderOwners = PersistentMap.withStringPrefix<Bytes, Address>("getOwner")
    this.payoutAddresses = PersistentMap.withStringPrefix<Bytes, Address>("getPayoutAddresses")
    this.orderIndex = PersistentMap.withStringPrefix<Bytes, i32>("getOrderIndex")
    this.amountsDNA = PersistentMap.withStringPrefix<Bytes, Balance>("getAmountDNA")
    this.amountsXDAI = PersistentMap.withStringPrefix<Bytes, Balance>("getAmountXDAI")
    this.expirationBlocks = PersistentMap.withStringPrefix<Bytes, u64>("getExpirationBlock")
    this.matchers = PersistentMap.withStringPrefix<Bytes, Address>("getMatcher")
    this.matchExpirationBlocks = PersistentMap.withStringPrefix<Bytes, u64>("getMatchExpirationBlock")

    // security deposits
    this.securityDeposits = PersistentMap.withStringPrefix<Address, Balance>("getDeposit")
    this.securityDepositInUse = PersistentMap.withStringPrefix<Address, bool>("isDepositInUse")


    // system parameters
    this.requiredSecurityDepositAmount = requiredSecurityDepositAmount
    this.minAmount = minAmount
    this.minOrderTTLInBlocks = minOrderTTLInBlocks
    this.fulfillPeriodInBlocks = fulfillPeriodInBlocks
    this.protocolFund = protocolFund
    this.owner = Context.caller()
  }

  createOrder(amountXDAI: Balance, expirationBlock: u64, payoutAddress: Address, secretHash: Bytes): void {

    // VALIDATION CHECKS

    assert(Balance.gt(amountXDAI, Balance.Zero), "cannot create: amountOut should be > 0")
    assert(expirationBlock >= Context.blockNumber() + this.minOrderTTLInBlocks, "cannot create: expiration should be >= minOrderTTLInBlocks")
    assert(payoutAddress != new Address(0), "cannot create: incorrect payout address")

    assert(this.orderOwners.get(secretHash, new Address(0)) == new Address(0), "order already exists")

    const sender = Context.caller()
    const amountDNA = Context.payAmount()

    assert(Balance.ge(amountDNA, this.minAmount), "cannot create: amount should be >= minAmount")

    // STATE CHANGES


    const index = this.activeOrderCount.get(0)
    this.activeOrderCount.set(index + 1)
    this.activeOrders.set(index, secretHash)

    this.orderIndex.set(secretHash, index)

    this.orderOwners.set(secretHash, sender)
    this.payoutAddresses.set(secretHash, payoutAddress)
    this.amountsDNA.set(secretHash, amountDNA)
    this.amountsXDAI.set(secretHash, amountXDAI)
    this.expirationBlocks.set(secretHash, expirationBlock)

    Host.emitEvent("Order created", [secretHash])
  }

  matchOrder(secretHash: Bytes): void {

    // VALIDATION CHECKS

    const owner = this.orderOwners.get(secretHash, new Address(0))
    assert(owner != new Address(0), "cannot match: order doesn't exist")

    const newMatcher = Context.caller()
    assert(this.securityDeposits.get(newMatcher, Balance.Zero) == this.requiredSecurityDepositAmount, "cannot match: not enough security deposit")
    assert(!this.securityDepositInUse.get(newMatcher, false), "cannot match: security deposit already in use")

    const oldMatcher = this.matchers.get(secretHash, new Address(0))
    if (oldMatcher != new Address(0)) { // order matched
      if (Context.blockNumber() > this.matchExpirationBlocks.get(secretHash, 0)) { // order expired
        // penalize an old matcher for allowing the expiration
        // in case the owner failed - the matcher will be able to claim owner's deposit on GC
        const fineAmount = this.securityDeposits.get(oldMatcher, Balance.Zero)
        this.securityDeposits.delete(oldMatcher)
        this.securityDepositInUse.delete(oldMatcher)
        Host.createTransferPromise(this.protocolFund, fineAmount)
      } else {
        assert(false, "cannot match: fulfillment in progress");
      }
    }

    const matchExpirationBlock = Context.blockNumber() + this.fulfillPeriodInBlocks
    assert(this.expirationBlocks.get(secretHash, 0) >= (matchExpirationBlock) , "order expired")

    // STATE CHANGES

    this.securityDepositInUse.set(newMatcher, true)

    this.matchers.set(secretHash, newMatcher)
    this.matchExpirationBlocks.set(secretHash, matchExpirationBlock)

    Host.emitEvent("Order matched", [secretHash])
  }

  burnOrder(secretHash: Bytes): void {

    // VALIDATION CHECKS

    const expirationBlock = this.expirationBlocks.get(secretHash, 0)
    assert(expirationBlock != 0, "cannot cancel: order doesn't exist")

    const matcher = this.matchers.get(secretHash, new Address(0))
    assert(
        (matcher != new Address(0) && Context.blockNumber() >= expirationBlock)
        || (matcher == new Address(0) && Context.blockNumber() > expirationBlock - this.fulfillPeriodInBlocks)
        , "cannot cancel: not yet expired")

    // STATE CHANGES

    if (matcher != new Address(0)) { // order matched
      // penalize a matcher for allowing the expiration
      const securityDeposit = this.securityDeposits.get(matcher, Balance.Zero)
      this.securityDeposits.delete(matcher)
      this.securityDepositInUse.delete(matcher)
      Host.createTransferPromise(this.protocolFund, securityDeposit)

      this.matchers.delete(secretHash)
      this.matchExpirationBlocks.delete(secretHash)
    }

    const owner = this.orderOwners.get(secretHash, new Address(0))
    const amountDNA = this.amountsDNA.get(secretHash, Balance.Zero)

    const index = this.orderIndex.get(secretHash, 0)
    const lastIndex = this.activeOrderCount.get(0) - 1
    this.activeOrderCount.set(lastIndex)
    const lastOrderSecretHash = this.activeOrders.get(lastIndex, secretHash)
    this.activeOrders.delete(lastIndex)

    if (lastIndex !== index) {
      this.activeOrders.set(index, lastOrderSecretHash)
      this.orderIndex.set(lastOrderSecretHash, index)
    }

    this.orderIndex.delete(secretHash)
    this.orderOwners.delete(secretHash)
    this.payoutAddresses.delete(secretHash)
    this.amountsDNA.delete(secretHash)
    this.amountsXDAI.delete(secretHash)
    this.expirationBlocks.delete(secretHash)

    Host.createTransferPromise(owner, amountDNA)

    Host.emitEvent("Order cancelled", [secretHash])
  }

  completeOrder(secret: Uint8Array): void {

    // VALIDATION CHECKS

    const secretHash = Host.keccac256(secret) // keccak?
    const expirationBlock = this.expirationBlocks.get(secretHash, 0)
    assert(expirationBlock > Context.blockNumber(), "cannot complete: order expired or doesn't exist or not yet expired")

    const matcher = this.matchers.get(secretHash, new Address(0))
    assert(matcher != new Address(0), "cannot complete: not matched")

    const amountDNA = this.amountsDNA.get(secretHash, Balance.Zero)

    // STATE CHANGES

    const index = this.orderIndex.get(secretHash, 0)
    const lastIndex = this.activeOrderCount.get(0) - 1
    this.activeOrderCount.set(lastIndex)

    const lastOrderSecretHash = this.activeOrders.get(lastIndex, secretHash)

    this.activeOrders.delete(lastIndex)

    if (lastIndex !== index) {
      this.activeOrders.set(index, lastOrderSecretHash)
      this.orderIndex.set(lastOrderSecretHash, index)
    }

    this.orderIndex.delete(secretHash)
    this.orderOwners.delete(secretHash)
    this.amountsDNA.delete(secretHash)
    this.amountsXDAI.delete(secretHash)
    this.payoutAddresses.delete(secretHash)
    this.expirationBlocks.delete(secretHash)

    this.matchers.delete(secretHash)
    this.matchExpirationBlocks.delete(secretHash)

    this.securityDepositInUse.delete(matcher)

    Host.createTransferPromise(matcher, amountDNA)

    Host.emitEvent("Order completed", [secretHash])
  }

  submitSecurityDeposit(): void {

    // VALIDATION CHECKS

    assert(
        this.securityDeposits.get(Context.caller(), Balance.Zero) == Balance.Zero,
        "cannot submit: deposit already submitted"
    )
    assert(Context.payAmount() == this.requiredSecurityDepositAmount, "cannot submit: incorrect amount")

    // STATE CHANGES

    this.securityDeposits.set(Context.caller(), Context.payAmount())

    Host.emitEvent("Security deposit submitted", [Context.caller()])
  }

  withdrawSecurityDeposit(): void {

    // VALIDATION CHECKS

    assert(!this.securityDepositInUse.get(Context.caller(), false), "cannot withdraw: fulfillment in progress")

    const securityDeposit = this.securityDeposits.get(Context.caller(), Balance.Zero)
    assert(Balance.gt(securityDeposit, Balance.Zero), "cannot withdraw: deposit not found")

    // STATE CHANGES

    this.securityDeposits.delete(Context.caller())

    Host.createTransferPromise(Context.caller(), securityDeposit)

    Host.emitEvent("Security deposit withdrawn", [Context.caller()])
  }
}
