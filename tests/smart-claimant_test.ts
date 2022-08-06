import {
  Clarinet,
  Tx,
  Chain,
  Account,
  types,
} from "https://deno.land/x/clarinet@v0.33.0/index.ts";
import { assertEquals } from "https://deno.land/std@0.90.0/testing/asserts.ts";

Clarinet.test({
  name: "Disburses tokens once it can claim the time-locked wallet balance",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get("deployer")!.address;
    const beneficiary = `${deployer}.smart-claimant`;
    const wallet1 = accounts.get("wallet_1")!.address;
    const wallet2 = accounts.get("wallet_2")!.address;
    const wallet3 = accounts.get("wallet_3")!.address;
    const wallet4 = accounts.get("wallet_4")!.address;
    const unlock_height = 10;
    const amount = 1000;
    const share = Math.floor(amount / 4);

    chain.mineBlock([
      Tx.contractCall(
        "timelocked",
        "lock",
        [
          types.principal(beneficiary),
          types.uint(unlock_height),
          types.uint(amount),
        ],
        deployer
      ),
    ]);

    chain.mineEmptyBlockUntil(unlock_height);

    let block = chain.mineBlock([
      Tx.contractCall("smart-claimant", "claim", [], deployer),
    ]);

    let [receipt] = block.receipts;
    receipt.result.expectErr().expectUint(104);

    receipt.events.expectSTXTransferEvent(share, beneficiary, wallet1);
    receipt.events.expectSTXTransferEvent(share, beneficiary, wallet2);
    receipt.events.expectSTXTransferEvent(share, beneficiary, wallet3);
    receipt.events.expectSTXTransferEvent(share, beneficiary, wallet4);
  },
});
