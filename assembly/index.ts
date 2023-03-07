import {
  Address,
  Balance,
  Bytes,
  Context,
  Host,
  PersistentMap,
} from "idena-sdk-as"
import { SwapOrder } from "./types"

const nullOrder = new SwapOrder(
  new Address(0),
  new Address(0),
  Balance.Zero,
  Balance.Zero,
  0,
)

export class AtomicDex {
  owner: Address
  minAmount: Balance
  minOrderTTLInBlocks: u64
  fulfillPeriodInBlocks: u64
  gapAfterFulfillment: u64
  orders: PersistentMap<Bytes, SwapOrder>
  securityDeposits: PersistentMap<Address, Balance>
  protocolFund: Address
  requiredSecurityDepositAmount: Balance
  securityDepositInUse: PersistentMap<Address, bool>

  constructor(
      requiredSecurityDepositAmount: Balance,
      minAmount: Balance,
      minOrderTTLInBlocks: u64,
      fulfillPeriodInBlocks: u64,
      minBlocksAfterFulfillment: u64,
      protocolFund: Address,
  ) {
    this.orders = PersistentMap.withStringPrefix<Bytes, SwapOrder>("o:")
    this.securityDeposits = PersistentMap.withStringPrefix<Address, Balance>("d:")
    this.securityDepositInUse = PersistentMap.withStringPrefix<Address, bool>("u:")
    this.requiredSecurityDepositAmount = requiredSecurityDepositAmount
    this.minAmount = minAmount
    this.minOrderTTLInBlocks = minOrderTTLInBlocks
    this.fulfillPeriodInBlocks = fulfillPeriodInBlocks
    this.gapAfterFulfillment = minBlocksAfterFulfillment
    this.protocolFund = protocolFund
    this.owner = Context.caller()
  }

  createOrder(amountXDAI: Balance, expirationBlock: u64, payoutAddress: Address, secretHash: Bytes): void {

    // VALIDATION CHECKS

    assert(Balance.gt(amountXDAI, Balance.Zero), "amountOut should be > 0")
    assert(expirationBlock >= Context.blockNumber() + this.minOrderTTLInBlocks, "expiration should be >= minOrderTTLInBlocks")
    assert(payoutAddress != new Address(0), "incorrect payout address")

    assert(this.orders.get(secretHash, nullOrder).owner == new Address(0), "order already exists")

    const sender = Context.caller()
    const amountDNA = Context.payAmount()

    assert(Balance.ge(amountDNA, this.minAmount), "amount should be >= minAmount")

    const order = new SwapOrder(sender, payoutAddress, amountDNA, amountXDAI, expirationBlock)

    // STATE CHANGE

    this.orders.set(secretHash, order);

    Host.emitEvent("Order created", [secretHash])
  }

  matchOrder(secretHash: Bytes): void {

    // VALIDATION CHECKS

    const order = this.orders.get(secretHash, nullOrder)
    assert(order.owner != new Address(0), "cannot match: order doesn't exist")

    const matcher = Context.caller()
    assert(this.securityDeposits.get(matcher, Balance.Zero) == this.requiredSecurityDepositAmount, "cannot match: not enough security deposit")
    assert(!this.securityDepositInUse.get(matcher, false), "cannot match: security deposit already in use")

    if (order.matcher != new Address(0)) { // order matched
      if (Context.blockNumber() > order.matchExpirationBlock) { // order expired
        // penalize an old matcher for allowing the expiration
        // in case the owner failed - the matcher will be able to claim owner's deposit on GC
        const fine = this.securityDeposits.get(matcher, Balance.Zero)
        this.securityDeposits.delete(matcher)
        this.securityDepositInUse.delete(matcher)
        Host.createTransferPromise(this.protocolFund, fine)
      } else {
        assert(false, "cannot match: fulfillment in progress");
      }
    }

    const matchExpirationBlock = Context.blockNumber() + this.fulfillPeriodInBlocks
    assert(order.expirationBlock >= (matchExpirationBlock + this.gapAfterFulfillment) , "order expired")

    // STATE CHANGES

    this.securityDepositInUse.set(matcher, true)
    order.matcher = matcher
    order.matchExpirationBlock = matchExpirationBlock
    this.orders.set(secretHash, order);

    Host.emitEvent("Order matched", [secretHash])
  }

  burnOrder(secretHash: Bytes): void {

    // VALIDATION CHECKS

    const order = this.orders.get(secretHash, nullOrder)
    assert(order.expirationBlock != 0, "cannot cancel: order doesn't exist")
    assert(Context.blockNumber() >= order.expirationBlock, "cannot cancel: not yet expired")

    // STATE CHANGES

    if (order.matcher != new Address(0)) { // order matched
      // penalize a matcher for allowing the expiration
      const securityDeposit = this.securityDeposits.get(order.matcher, Balance.Zero)
      this.securityDeposits.delete(order.matcher)
      this.securityDepositInUse.delete(order.matcher)
      Host.createTransferPromise(this.protocolFund, securityDeposit)
    }

    const owner = order.owner
    const amountDNA = order.amountDNA
    this.orders.delete(secretHash)

    Host.createTransferPromise(owner, amountDNA)

    Host.emitEvent("Order cancelled", [secretHash])
  }

  finalizeOrder(secret: Uint8Array): void {

    // VALIDATION CHECKS

    const secretHash = Host.keccac256(secret) // keccak?
    const order = this.orders.get(secretHash, nullOrder)
    assert(order.expirationBlock > Context.blockNumber(), "cannot finalize: order expired or doesn't exist")


    const matcher = order.matcher
    const amountDNA = order.amountDNA

    // STATE CHANGES

    this.orders.delete(secretHash)
    this.securityDepositInUse.delete(matcher)

    Host.createTransferPromise(matcher, amountDNA)

    Host.emitEvent("Order finalized", [secretHash])
  }

  withdrawSecurityDeposit(): void {

    // VALIDATION CHECKS

    assert(!this.securityDepositInUse.get(Context.caller(), false), "cannot withdraw: fulfillment in progress")

    const securityDeposit = this.securityDeposits.get(Context.caller(), Balance.Zero)
    assert(securityDeposit == this.requiredSecurityDepositAmount, "cannot withdraw: deposit not found")

    // STATE CHANGES

    this.securityDeposits.delete(Context.caller())

    Host.createTransferPromise(Context.caller(), securityDeposit)

    Host.emitEvent("Security deposit withdrawn", [Context.caller()])
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
}
