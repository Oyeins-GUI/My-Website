import {
  Clarinet,
  Tx,
  Chain,
  Account,
  types,
} from "https://deno.land/x/clarinet@v0.33.0/index.ts";
import { assertEquals } from "https://deno.land/std@0.90.0/testing/asserts.ts";

// Test for the Lock Function
Clarinet.test({
  name: "Allows the contract owner to lock an amount",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get("deployer")!.address;
    const beneficiary = accounts.get("wallet_1")!.address;
    const amount = 10;
    const block = chain.mineBlock([
      Tx.contractCall(
        "timelocked-wallet",
        "lock",
        [types.principal(beneficiary), types.uint(10), types.uint(amount)],
        deployer
      ),
    ]);

    block.receipts[0].result.expectOk().expectBool(true);
    block.receipts[0].events.expectSTXTransferEvent(
      amount,
      deployer,
      `${deployer}.timelocked-wallet`
    );
  },
});

Clarinet.test({
  name: "Does not allow anyone else to lock an amount",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const accountA = accounts.get("wallet_1")!.address;
    const beneficiary = accounts.get("wallet_2")!.address;
    const block = chain.mineBlock([
      Tx.contractCall(
        "timelocked-wallet",
        "lock",
        [types.principal(accountA), types.uint(10), types.uint(10)],
        accountA
      ),
    ]);

    block.receipts[0].result.expectErr().expectUint(100);
  },
});

Clarinet.test({
  name: "Cannot lock more than once",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get("deployer")!.address;
    const beneficiary = accounts.get("wallet_1")!.address;
    const amount = 10;
    const block = chain.mineBlock([
      Tx.contractCall(
        "timelocked-wallet",
        "lock",
        [types.principal(beneficiary), types.uint(10), types.uint(amount)],
        deployer
      ),
      Tx.contractCall(
        "timelocked-wallet",
        "lock",
        [types.principal(beneficiary), types.uint(10), types.uint(amount)],
        deployer
      ),
    ]);

    block.receipts[0].result.expectOk().expectBool(true);
    block.receipts[0].events.expectSTXTransferEvent(
      amount,
      deployer,
      `${deployer}.timelocked-wallet`
    );
    block.receipts[1].result.expectErr().expectUint(101);

    assertEquals(block.receipts[1].events.length, 0);
  },
});

// Test for the Bestow Function
Clarinet.test({
  name: "Allows the beneficiary to bestow the right to claim to someone else",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get("deployer")!.address;
    const beneficiary = accounts.get("wallet_1")!.address;
    const newBeneficiary = accounts.get("wallet_2")!.address;
    const block = chain.mineBlock([
      Tx.contractCall(
        "timelocked-wallet",
        "lock",
        [types.principal(beneficiary), types.uint(10), types.uint(10)],
        deployer
      ),
      Tx.contractCall(
        "timelocked-wallet",
        "bestow",
        [types.principal(newBeneficiary)],
        beneficiary
      ),
    ]);

    block.receipts.map(({ result }) => result.expectOk().expectBool(true));
  },
});

Clarinet.test({
  name: "Does not allow anyone else to bestow the right to claim to someone else (not even the contract owner)",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get("deployer")!.address;
    const beneficiary = accounts.get("wallet_1")!.address;
    const accountA = accounts.get("wallet_3")!.address;
    const block = chain.mineBlock([
      Tx.contractCall(
        "timelocked-wallet",
        "lock",
        [types.principal(beneficiary), types.uint(10), types.uint(10)],
        deployer
      ),
      Tx.contractCall(
        "timelocked-wallet",
        "bestow",
        [types.principal(deployer)],
        deployer
      ),
      Tx.contractCall(
        "timelocked-wallet",
        "bestow",
        [types.principal(accountA)],
        accountA
      ),
    ]);

    // All but the first call fails with err-beneficiary-only (err u104).
    block.receipts
      .slice(1)
      .map(({ result }) => result.expectErr().expectUint(104));
  },
});

// Test for the Claim Function
Clarinet.test({
  name: "Allows the beneficiary to claim the balance when the block-height is reached",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get("deployer")!.address;
    const beneficiary = accounts.get("wallet_1")!.address;
    const targetBlockHeight = 10;
    const amount = 10;
    chain.mineBlock([
      Tx.contractCall(
        "timelocked-wallet",
        "lock",
        [
          types.principal(beneficiary),
          types.uint(targetBlockHeight),
          types.uint(amount),
        ],
        deployer
      ),
    ]);

    // Advance the chain until the unlock height.
    chain.mineEmptyBlockUntil(targetBlockHeight);

    const block = chain.mineBlock([
      Tx.contractCall("timelocked-wallet", "claim", [], beneficiary),
    ]);

    // The claim was successful and the STX were transferred.
    block.receipts[0].result.expectOk().expectBool(true);
    block.receipts[0].events.expectSTXTransferEvent(
      amount,
      `${deployer}.timelocked-wallet`,
      beneficiary
    );
  },
});

Clarinet.test({
  name: "Does not allow the beneficiary to claim the balance before the block-height is reached",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get("deployer")!.address;
    const beneficiary = accounts.get("wallet_1")!.address;
    const targetBlockHeight = 10;
    const amount = 10;
    chain.mineBlock([
      Tx.contractCall(
        "timelocked-wallet",
        "lock",
        [
          types.principal(beneficiary),
          types.uint(targetBlockHeight),
          types.uint(amount),
        ],
        deployer
      ),
    ]);

    // Advance the chain until the unlock height minus one.
    chain.mineEmptyBlockUntil(targetBlockHeight - 1);

    const block = chain.mineBlock([
      Tx.contractCall("timelocked-wallet", "claim", [], beneficiary),
    ]);

    // Should return err-unlock-height-not-reached (err u105).
    block.receipts[0].result.expectErr().expectUint(105);
    assertEquals(block.receipts[0].events.length, 0);
  },
});

Clarinet.test({
  name: "Does not allow anyone else to claim the balance when the block-height is reached",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get("deployer")!.address;
    const beneficiary = accounts.get("wallet_1")!.address;
    const other = accounts.get("wallet_2")!.address;
    const targetBlockHeight = 10;
    const amount = 10;
    chain.mineBlock([
      Tx.contractCall(
        "timelocked-wallet",
        "lock",
        [
          types.principal(beneficiary),
          types.uint(targetBlockHeight),
          types.uint(amount),
        ],
        deployer
      ),
    ]);

    // Advance the chain until the unlock height.
    chain.mineEmptyBlockUntil(targetBlockHeight);

    const block = chain.mineBlock([
      Tx.contractCall("timelocked-wallet", "claim", [], other),
    ]);

    // Should return err-beneficiary-only (err u104).
    block.receipts[0].result.expectErr().expectUint(104);
    assertEquals(block.receipts[0].events.length, 0);
  },
});
