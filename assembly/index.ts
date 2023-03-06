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
  orderTTL: i64
  timeToFulfill: i64
  timeGapAfterFulfillment: i64
  orders: PersistentMap<Bytes, SwapOrder>
  securityDeposits: PersistentMap<Address, Balance>
  protocolFund: Address
  requiredSecurityDepositAmount: Balance
  securityDepositInUse: PersistentMap<Address, bool>

  constructor(
      requiredSecurityDepositAmount: Balance,
      minAmount: Balance,
      minTimeout: i64,
      timeToFulfill: i64,
      minTimeAfterFulfillment: i64,
      fee: u32,
      protocolFund: Address,
  ) {
    this.requiredSecurityDepositAmount = requiredSecurityDepositAmount
    this.minAmount = minAmount
    this.orderTTL = minTimeout
    this.timeToFulfill = timeToFulfill
    this.timeGapAfterFulfillment = minTimeAfterFulfillment
    this.protocolFund = protocolFund
    this.owner = Context.caller()
  }

  createOrder(amountXDAI: Balance, timeout: i64, secretHash: Bytes, payoutAddress: Address): void {
    assert(Balance.gt(amountXDAI, Balance.Zero), "amountOut should be > 0")
    assert(timeout >= this.orderTTL, "timeout should be >= minTimeout")
    assert(payoutAddress != new Address(0), "incorrect payout address")

    assert(this.orders.get(secretHash, nullOrder).owner == new Address(0), "order already exists")

    const sender = Context.caller()
    const amount = Context.payAmount()

    assert(Balance.ge(amount, this.minAmount), "amountIn should be >= minAmount")

    const order = new SwapOrder(sender, payoutAddress, amount, amountXDAI, Context.blockTimestamp() + timeout)

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
      if (Context.blockTimestamp() > order.matchExpiration) { // order expired
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

    const matchExpiration = Context.blockTimestamp() + this.timeToFulfill
    assert(order.expiration >= (matchExpiration + this.timeGapAfterFulfillment) , "order expired")

    // STATE CHANGES

    this.securityDepositInUse.set(matcher, true)
    order.matcher = matcher
    order.matchExpiration = matchExpiration
    this.orders.set(secretHash, order);

    Host.emitEvent("Order matched", [secretHash])
  }

  cancelOrder(secretHash: Bytes): void {
    const order = this.orders.get(secretHash, nullOrder)

    assert(order.expiration != 0, "cannot cancel: order doesn't exist")
    assert(Context.blockTimestamp() >= order.expiration, "cannot cancel: not yet expired")

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
    const secretHash = Host.keccac256(secret)
    const order = this.orders.get(secretHash, nullOrder)
    assert(order.expiration > Context.blockTimestamp(), "cannot finalize: order expired or doesn't exist")


    const matcher = order.matcher
    const amountDNA = order.amountDNA

    this.orders.delete(secretHash)
    this.securityDepositInUse.delete(matcher)

    Host.createTransferPromise(matcher, amountDNA)

    Host.emitEvent("Order finalized", [secretHash])
  }

  withdrawSecurityDeposit(): void {
    assert(!this.securityDepositInUse.get(Context.caller(), false), "cannot withdraw: fulfillment in progress")

    const securityDeposit = this.securityDeposits.get(Context.caller(), Balance.Zero)
    assert(securityDeposit == this.requiredSecurityDepositAmount, "cannot withdraw: deposit not found")

    this.securityDeposits.delete(Context.caller())

    Host.createTransferPromise(Context.caller(), securityDeposit)

    Host.emitEvent("Security deposit withdrawn", [Context.caller()])
  }

  submitSecurityDeposit(): void {
    assert(
        this.securityDeposits.get(Context.caller(), Balance.Zero) == Balance.Zero,
        "cannot submit: deposit already submitted"
    )
    assert(Context.payAmount() == this.requiredSecurityDepositAmount, "cannot submit: incorrect amount")

    this.securityDeposits.set(Context.caller(), Context.payAmount())

    Host.emitEvent("Security deposit submitted", [Context.caller()])
  }
}
