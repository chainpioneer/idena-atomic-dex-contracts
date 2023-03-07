import { Address, Balance } from "idena-sdk-as"

@idenaBindgen
export class SwapOrder {
    owner : Address
    matcher : Address
    ownerPayoutAddress : Address
    amountDNA : Balance
    amountXDAI : Balance
    expirationBlock : u64
    matchExpirationBlock : u64

    constructor(owner : Address, ownerPayoutAddress : Address, amountDNA : Balance, amountXDAI : Balance, expiration : u64) {
        this.owner = owner;
        this.ownerPayoutAddress = ownerPayoutAddress;
        this.amountDNA = amountDNA;
        this.amountXDAI = amountXDAI;
        this.expirationBlock = expiration;
        this.matcher = new Address(0);
        this.matchExpirationBlock = 0;
    }
}