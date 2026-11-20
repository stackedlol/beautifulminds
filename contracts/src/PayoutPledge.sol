// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title PayoutPledge
/// @notice A public, append-only promise: a fixed share of every X creator
///         payout is given away, when and where the creator chooses. The share
///         is set once at deploy and can never be lowered. The creator can end
///         the pledge in public with `end()`. Every payout in and every grant
///         out is recorded as an event anyone can read, and the off-chain
///         ledger (ledger/ledger.json) is anchored here by its head hash.
/// @dev    A contract cannot pull fiat out of a bank account. What it can do is
///         make the record permanent and the arithmetic public: anyone can read
///         `outstandingCents`, and nobody, including the creator, can edit
///         that history.
contract PayoutPledge {
    address public immutable creator;
    uint16 public immutable shareBps; // 10000 = 100%
    bytes32 public immutable statementHash; // keccak256 of the letter / statement

    struct Payout {
        uint64 at;
        uint128 amountCents;
        bytes32 ref; // hash of the X payout statement
    }

    struct Grant {
        uint64 at;
        uint128 amountCents;
        string recipient;
        bytes32 ref; // hash of the receipt
    }

    Payout[] public payouts;
    Grant[] public grants;
    uint256 public receivedCents;
    uint256 public givenCents;

    uint64 public endedAt; // 0 while the pledge is open

    uint256 public ledgerSeq;
    bytes32 public ledgerHead;

    event PayoutRecorded(uint256 indexed id, uint128 amountCents, bytes32 ref);
    event GrantRecorded(uint256 indexed id, uint128 amountCents, string recipient, bytes32 ref);
    event LedgerAnchored(uint256 indexed seq, bytes32 head);
    event PledgeEnded(uint64 at, string reason);

    error NotCreator();
    error BadTerms();
    error ZeroAmount();
    error StaleAnchor();
    error Ended();

    constructor(uint16 shareBps_, bytes32 statementHash_) {
        if (shareBps_ == 0 || shareBps_ > 10000) revert BadTerms();
        creator = msg.sender;
        shareBps = shareBps_;
        statementHash = statementHash_;
    }

    modifier onlyCreator() {
        if (msg.sender != creator) revert NotCreator();
        _;
    }

    function recordPayout(uint128 amountCents, bytes32 ref) external onlyCreator {
        if (endedAt != 0) revert Ended();
        if (amountCents == 0) revert ZeroAmount();
        payouts.push(Payout(uint64(block.timestamp), amountCents, ref));
        receivedCents += amountCents;
        emit PayoutRecorded(payouts.length - 1, amountCents, ref);
    }

    function recordGrant(uint128 amountCents, string calldata recipient, bytes32 ref) external onlyCreator {
        if (amountCents == 0) revert ZeroAmount();
        grants.push(Grant(uint64(block.timestamp), amountCents, recipient, ref));
        givenCents += amountCents;
        emit GrantRecorded(grants.length - 1, amountCents, recipient, ref);
    }

    /// @notice Pin the off-chain ledger. Sequence numbers only move forward.
    function anchor(uint256 seq, bytes32 head) external onlyCreator {
        if (ledgerHead != bytes32(0) && seq <= ledgerSeq) revert StaleAnchor();
        ledgerSeq = seq;
        ledgerHead = head;
        emit LedgerAnchored(seq, head);
    }

    function owedCents() public view returns (uint256) {
        return _share(receivedCents);
    }

    function outstandingCents() external view returns (uint256) {
        uint256 owed = owedCents();
        return owed > givenCents ? owed - givenCents : 0;
    }

    /// @notice Close the pledge in public. No payouts after this; grants
    ///         can still be recorded to give away anything left.
    function end(string calldata reason) external onlyCreator {
        if (endedAt != 0) revert Ended();
        endedAt = uint64(block.timestamp);
        emit PledgeEnded(endedAt, reason);
    }

    function counts() external view returns (uint256, uint256) {
        return (payouts.length, grants.length);
    }

    function _share(uint256 amount) private view returns (uint256) {
        return (amount * shareBps + 9999) / 10000; // round up, never in the creator's favour
    }
}
