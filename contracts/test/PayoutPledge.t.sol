// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PayoutPledge} from "../src/PayoutPledge.sol";

// Minimal cheatcode surface, so the tests need no forge-std install.
interface Vm {
    function warp(uint256) external;
    function prank(address) external;
    function expectRevert(bytes4) external;
}

contract PayoutPledgeTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    PayoutPledge p;

    function setUp() public {
        vm.warp(1_800_000_000);
        p = new PayoutPledge(10000, keccak256("letter"));
    }

    function test_termsAreFixed() public view {
        require(p.shareBps() == 10000 && p.endedAt() == 0, "terms");
        require(p.creator() == address(this), "creator");
    }

    function test_onlyCreatorCanWrite() public {
        vm.prank(address(0xBEEF));
        vm.expectRevert(PayoutPledge.NotCreator.selector);
        p.recordPayout(100, bytes32(0));
    }

    function test_givenWheneverIChoose() public {
        p.recordPayout(41237, keccak256("nov"));
        require(p.outstandingCents() == 41237, "outstanding");
        vm.warp(block.timestamp + 400 days); // no deadline
        p.recordGrant(30000, "Research fund", keccak256("r1"));
        p.recordGrant(11237, "Therapy program", keccak256("r2"));
        require(p.outstandingCents() == 0, "all given");
    }

    function test_endStopsPayoutsNotGrants() public {
        p.recordPayout(50000, keccak256("dec"));
        p.end("Stepping back.");
        require(p.endedAt() == block.timestamp, "ended");
        vm.expectRevert(PayoutPledge.Ended.selector);
        p.recordPayout(100, bytes32(0));
        p.recordGrant(50000, "Research fund", keccak256("r3"));
        require(p.outstandingCents() == 0, "left over given");
        vm.expectRevert(PayoutPledge.Ended.selector);
        p.end("again");
    }

    function test_partialShareRoundsUp() public {
        PayoutPledge half = new PayoutPledge(5000, bytes32(0));
        half.recordPayout(101, bytes32(0));
        require(half.owedCents() == 51, "round up");
    }

    function test_anchorOnlyMovesForward() public {
        p.anchor(3, keccak256("h3"));
        vm.expectRevert(PayoutPledge.StaleAnchor.selector);
        p.anchor(3, keccak256("h3b"));
        p.anchor(4, keccak256("h4"));
        require(p.ledgerSeq() == 4, "seq");
    }

    function test_badTermsRejected() public {
        vm.expectRevert(PayoutPledge.BadTerms.selector);
        new PayoutPledge(0, bytes32(0));
    }
}
