// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
}

/// @title  PledgeVault
/// @notice Money in here can only ever leave to a charity. There is no withdraw.
///         - New charities wait 7 days before they can be paid, in public.
///         - If I go quiet for a year, anyone can send what's left to the fallback charity.
contract PledgeVault {
    uint256 public constant LISTING_DELAY = 7 days;
    uint256 public constant SILENCE = 365 days;

    IERC20 public immutable token; // USDC
    address public immutable creator;
    address public immutable fallbackCharity;

    mapping(address => uint256) public payableFrom; // charity => when it can be paid (0 = not listed)
    uint256 public lastActive;
    bool public ended;

    event Deposited(address indexed from, uint256 amount);
    event CharityListed(address indexed charity, string name, uint256 payableFrom);
    event Given(address indexed charity, uint256 amount);
    event Ended(string reason);

    error NotCreator();
    error NotPayable();
    error PledgeEnded();
    error StillActive();
    error TransferFailed();

    modifier onlyCreator() {
        if (msg.sender != creator) revert NotCreator();
        lastActive = block.timestamp;
        _;
    }

    constructor(IERC20 token_, address fallbackCharity_, string memory fallbackName) {
        token = token_;
        creator = msg.sender;
        fallbackCharity = fallbackCharity_;
        lastActive = block.timestamp;
        payableFrom[fallbackCharity_] = block.timestamp;
        emit CharityListed(fallbackCharity_, fallbackName, block.timestamp);
    }

    /// @notice Anyone can add to the pool.
    function deposit(uint256 amount) external {
        if (ended) revert PledgeEnded();
        if (!token.transferFrom(msg.sender, address(this), amount)) revert TransferFailed();
        emit Deposited(msg.sender, amount);
    }

    /// @notice The only way money leaves while I'm around: to a listed charity.
    function give(address charity, uint256 amount) external onlyCreator {
        if (payableFrom[charity] == 0 || block.timestamp < payableFrom[charity]) revert NotPayable();
        if (!token.transfer(charity, amount)) revert TransferFailed();
        emit Given(charity, amount);
    }

    function listCharity(address charity, string calldata name) external onlyCreator {
        payableFrom[charity] = block.timestamp + LISTING_DELAY;
        emit CharityListed(charity, name, payableFrom[charity]);
    }

    /// @notice Stop taking deposits. What's inside still only goes to charity.
    function end(string calldata reason) external onlyCreator {
        ended = true;
        emit Ended(reason);
    }

    /// @notice After a year of silence, anyone can push the balance to the fallback charity.
    function release() external {
        if (block.timestamp < lastActive + SILENCE) revert StillActive();
        uint256 amount = token.balanceOf(address(this));
        if (!token.transfer(fallbackCharity, amount)) revert TransferFailed();
        emit Given(fallbackCharity, amount);
    }
}
