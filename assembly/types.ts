import { Address, Balance } from "idena-sdk-as"

@idenaBindgen
export class SwapOrder {
    owner : Address
    matcher : Address
    ownerPayoutAddress : Address
    amountDNA : Balance
    amountXDAI : Balance
    expiration : i64
    matchExpiration : i64

    constructor(owner : Address, ownerPayoutAddress : Address, amountDNA : Balance, amountXDAI : Balance, expiration : i64) {
        this.owner = owner;
        this.ownerPayoutAddress = ownerPayoutAddress;
        this.amountDNA = amountDNA;
        this.amountXDAI = amountXDAI;
        this.expiration = expiration;
        this.matcher = new Address(0);
        this.matchExpiration = 0;
    }
}