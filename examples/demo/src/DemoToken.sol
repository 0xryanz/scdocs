// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Demo Token
/// @notice A tiny ERC20-like token used to exercise scdocs.
/// @dev Self-contained (no imports) so it builds anywhere. Every documentation
///      feature of scdocs is used somewhere in this file on purpose.
/// @custom:standard ERC-20 (partial)
contract DemoToken {
    /// @notice Token metadata.
    /// @param name token name
    /// @param symbol ticker symbol
    /// @param decimals display decimals
    struct Meta {
        string name;
        string symbol;
        uint8 decimals;
    }

    /// @notice Emitted whenever balances move.
    /// @param from sender (the zero address on mint)
    /// @param to receiver
    /// @param value amount moved, in base units
    event Transfer(address indexed from, address indexed to, uint256 value);

    /// @notice Emitted when an allowance is set.
    /// @param owner token owner
    /// @param spender approved spender
    /// @param value allowance granted
    event Approval(address indexed owner, address indexed spender, uint256 value);

    /// @notice Thrown when a transfer exceeds the available balance.
    /// @param available balance currently held
    /// @param required amount requested
    error InsufficientBalance(uint256 available, uint256 required);

    /// @notice Thrown when the caller lacks permission.
    /// @param caller the offending caller
    error NotAuthorised(address caller);

    /// @notice Contract owner. Only the owner may mint.
    address public owner;

    /// @notice Token name, fixed at deploy time.
    string public name;

    /// @notice Token ticker symbol.
    string public symbol;

    /// @notice Display decimals, always 18 here.
    uint8 public decimals;

    /// @notice Total tokens in existence.
    uint256 public totalSupply;

    /// @notice Balance of an account.
    /// @return the balance in base units
    mapping(address => uint256) public balanceOf;

    /// @notice Allowance granted by an owner to a spender.
    /// @return remaining allowance
    mapping(address => mapping(address => uint256)) public allowance;

    address[] internal _holders;

    /// @notice Deploy the token.
    /// @param name_ token name
    /// @param symbol_ ticker symbol
    constructor(string memory name_, string memory symbol_) {
        owner = msg.sender;
        name = name_;
        symbol = symbol_;
        decimals = 18;
    }

    /// @notice Mint new tokens.
    /// @dev Only the owner can mint. Emits {Transfer} from the zero address.
    /// @param to recipient
    /// @param amount amount to mint, in base units
    /// @custom:access owner
    function mint(address to, uint256 amount) external {
        if (msg.sender != owner) revert NotAuthorised(msg.sender);
        if (balanceOf[to] == 0 && amount > 0) _holders.push(to);
        balanceOf[to] += amount;
        totalSupply += amount;
        emit Transfer(address(0), to, amount);
    }

    /// @notice Move tokens from the caller to `to`.
    /// @param to recipient
    /// @param value amount to move
    /// @return ok always true, reverts on failure
    function transfer(address to, uint256 value) external returns (bool ok) {
        _move(msg.sender, to, value);
        return true;
    }

    /// @notice Move tokens on behalf of `from`, using an allowance.
    /// @param from the account to debit
    /// @param to recipient
    /// @param value amount to move
    /// @return ok always true, reverts on failure
    function transferFrom(address from, address to, uint256 value) external returns (bool ok) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            if (allowed < value) revert InsufficientBalance(allowed, value);
            allowance[from][msg.sender] = allowed - value;
        }
        _move(from, to, value);
        return true;
    }

    /// @notice Approve a spender.
    /// @param spender the address being approved
    /// @param value allowance to grant, or `type(uint256).max` for unlimited
    /// @return ok always true
    function approve(address spender, uint256 value) external returns (bool ok) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    /// @notice Buy tokens by sending ether. Rate: 1 ETH = 1000 tokens.
    /// @dev Exists purely to exercise `payable` in the generated UI.
    function buy() external payable {
        if (msg.value == 0) revert InsufficientBalance(0, 1);
        uint256 amount = msg.value / 1e15;
        if (balanceOf[msg.sender] == 0) _holders.push(msg.sender);
        balanceOf[msg.sender] += amount;
        totalSupply += amount;
        emit Transfer(address(0), msg.sender, amount);
    }

    /// @notice Rename the token.
    /// @dev Demonstrates a struct (tuple) argument.
    /// @param next the complete new metadata
    /// @custom:access owner
    function setMeta(Meta calldata next) external {
        if (msg.sender != owner) revert NotAuthorised(msg.sender);
        name = next.name;
        symbol = next.symbol;
        decimals = next.decimals;
    }

    /// @notice Read the current metadata.
    /// @return the full struct
    /// @return holders number of distinct holders
    function meta() external view returns (Meta memory, uint256 holders) {
        return (Meta(name, symbol, decimals), _holders.length);
    }

    /// @notice Transfer to several recipients in one transaction.
    /// @dev Demonstrates array arguments.
    /// @param tos recipients, same length as `amounts`
    /// @param amounts amounts in base units
    function batchTransfer(address[] calldata tos, uint256[] calldata amounts) external {
        if (tos.length != amounts.length) revert InsufficientBalance(tos.length, amounts.length);
        for (uint256 i = 0; i < tos.length; i++) {
            _move(msg.sender, tos[i], amounts[i]);
        }
    }

    /// @notice Every address that has ever held a balance.
    /// @dev Demonstrates an array return value.
    /// @return all holders
    /// @return balances matching balances
    function holders() external view returns (address[] memory, uint256[] memory balances) {
        balances = new uint256[](_holders.length);
        for (uint256 i = 0; i < _holders.length; i++) {
            balances[i] = balanceOf[_holders[i]];
        }
        return (_holders, balances);
    }

    /// @notice Overloaded for uint256.
    /// @param x any number
    /// @return x unchanged
    function ping(uint256 x) external pure returns (uint256) {
        return x;
    }

    /// @notice Overloaded for bytes32.
    /// @param b any word
    /// @return b unchanged
    function ping(bytes32 b) external pure returns (bytes32) {
        return b;
    }

    // Deliberately has no NatSpec: exercises scdocs' fallback rendering.
    function version() external pure returns (uint256) {
        return 1;
    }

    function _move(address from, address to, uint256 value) internal {
        uint256 available = balanceOf[from];
        if (available < value) revert InsufficientBalance(available, value);
        unchecked {
            balanceOf[from] = available - value;
        }
        if (balanceOf[to] == 0 && value > 0) _holders.push(to);
        balanceOf[to] += value;
        emit Transfer(from, to, value);
    }
}
