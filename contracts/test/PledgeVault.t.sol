// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PledgeVault, IERC20} from "../src/PledgeVault.sol";

// Minimal cheatcode surface, so the tests need no forge-std install.
interface Vm {
    function warp(uint256) external;
    function prank(address) external;
    function expectRevert(bytes4) external;
}

contract MockUSDC {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 a) external { balanceOf[to] += a; }
    function approve(address s, uint256 a) external returns (bool) { allowance[msg.sender][s] = a; return true; }
    function transfer(address to, uint256 a) external returns (bool) { return _move(msg.sender, to, a); }
    function transferFrom(address f, address to, uint256 a) external returns (bool) {
        allowance[f][msg.sender] -= a;
        return _move(f, to, a);
    }
    function _move(address f, address to, uint256 a) private returns (bool) {
        balanceOf[f] -= a;
        balanceOf[to] += a;
        return true;
    }
}

contract PledgeVaultTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    MockUSDC usdc;
    PledgeVault v;
    address constant BBRF = address(0xB0B);
    address constant MY_WALLET = address(0xBAD);
    address constant STRANGER = address(0xBEEF);

    function setUp() public {
        vm.warp(1_800_000_000);
        usdc = new MockUSDC();
        v = new PledgeVault(IERC20(address(usdc)), BBRF, "Brain & Behavior Research Foundation");
        usdc.mint(address(this), 1_000e6);
        usdc.approve(address(v), type(uint256).max);
        v.deposit(400e6);
    }

    function test_givesToCharity() public {
        v.give(BBRF, 300e6);
        require(usdc.balanceOf(BBRF) == 300e6, "charity paid");
    }

    function test_cannotPayAnUnlistedWallet() public {
        vm.expectRevert(PledgeVault.NotPayable.selector);
        v.give(MY_WALLET, 400e6);
    }

    function test_newCharityWaitsAWeekInPublic() public {
        v.listCharity(MY_WALLET, "totally a charity");
        vm.warp(block.timestamp + 6 days);
        vm.expectRevert(PledgeVault.NotPayable.selector);
        v.give(MY_WALLET, 400e6);
    }

    function test_onlyCreatorCanGive() public {
        vm.prank(STRANGER);
        vm.expectRevert(PledgeVault.NotCreator.selector);
        v.give(BBRF, 400e6);
    }

    function test_endStopsDepositsNotGiving() public {
        v.end("Stepping back.");
        vm.expectRevert(PledgeVault.PledgeEnded.selector);
        v.deposit(1e6);
        v.give(BBRF, 400e6);
    }

    function test_aYearOfSilenceReleasesToCharity() public {
        vm.warp(block.timestamp + 364 days);
        vm.expectRevert(PledgeVault.StillActive.selector);
        v.release();
        vm.warp(block.timestamp + 1 days);
        vm.prank(STRANGER); // anyone can trigger it
        v.release();
        require(usdc.balanceOf(BBRF) == 400e6, "fallback paid");
    }
}
