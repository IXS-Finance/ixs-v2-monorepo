// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;
pragma experimental ABIEncoderV2;

import "@balancer-labs/v2-interfaces/contracts/solidity-utils/openzeppelin/IERC20.sol";
import "@balancer-labs/v2-interfaces/contracts/solidity-utils/openzeppelin/IERC20Permit.sol";
import "@balancer-labs/v2-interfaces/contracts/vault/IRwaERC20.sol";
import "../openzeppelin/ERC20.sol";

contract TestRwaERC20 is ERC20 {
    // Store the max batch burn size
    uint16 private _maxBatchBurnSize;

    // Store frozen accounts
    mapping(address => bool) private _frozenAccounts;

    // A basic implementation for decimals
    uint8 private _decimals = 18;

    // A simple ERC20 balance mapping (for testing purposes)
    mapping(address => uint256) private _balances;

    // Implement all required methods for testing

    function decimals() external view override returns (uint8) {
        return _decimals;
    }

    function supportsInterface(bytes4 interfaceId) external view override returns (bool) {
        // Calculate the interfaceId for IRwaERC20 using type()
        return interfaceId == type(IRwaERC20).interfaceId;
    }

    function maxBatchBurnSize() external view override returns (uint16) {
        return _maxBatchBurnSize;
    }

    function isFrozen(address account) external view override returns (bool) {
        return _frozenAccounts[account];
    }

    function burn(uint256 amount) external override {
        // For testing, subtract from sender's balance
        require(_balances[msg.sender] >= amount, "Insufficient balance");
        _balances[msg.sender] -= amount;
        emit Redeemed(amount);
    }

    function burnFrom(address account, uint256 amount) external override {
        // For testing, subtract from the account's balance
        require(_balances[account] >= amount, "Insufficient balance");
        _balances[account] -= amount;
        emit Redeemed(amount);
    }

    function batchBurnFrom(address[] memory accounts, uint256[] memory amounts) external override {
        require(accounts.length == amounts.length, "Mismatched inputs");
        for (uint256 i = 0; i < accounts.length; i++) {
            require(_balances[accounts[i]] >= amounts[i], "Insufficient balance");
            _balances[accounts[i]] -= amounts[i];
        }
        emit SetMaxBatchBurnSize(_maxBatchBurnSize);
    }

    function setMaxBatchBurnSize(uint16 maxBatchBurnSize) external override {
        _maxBatchBurnSize = maxBatchBurnSize;
        emit SetMaxBatchBurnSize(maxBatchBurnSize);
    }

    function mint(address account, uint256 amount) external override {
        _mint(account, amount);
    }

    function freeze(address _blackListedUser) external override {
        _frozenAccounts[_blackListedUser] = true;
        emit AddedFreeze(_blackListedUser);
    }

    function unFreeze(address _blackListedUser) external override {
        _frozenAccounts[_blackListedUser] = false;
        emit RemovedFreeze(_blackListedUser);
    }

    function pause() external override {
        // Implement a mock pause functionality for testing
    }

    function unpause() external override {
        // Implement a mock unpause functionality for testing
    }

    function getVersion() external pure override returns (string memory) {
        return "v1.0.0";
    }

    // ERC20 functions required by the interface
    function totalSupply() external view override returns (uint256) {
        return 0;
    }

    function balanceOf(address account) external view override returns (uint256) {
        return _balances[account];
    }

    function transfer(address recipient, uint256 amount) external override returns (bool) {
        require(_balances[msg.sender] >= amount, "Insufficient balance");
        _balances[msg.sender] -= amount;
        _balances[recipient] += amount;
        return true;
    }

    function allowance(address owner, address spender) external view override returns (uint256) {
        return 0;
    }

    function approve(address spender, uint256 amount) external override returns (bool) {
        return true;
    }

    function transferFrom(
        address sender,
        address recipient,
        uint256 amount
    ) external override returns (bool) {
        require(_balances[sender] >= amount, "Insufficient balance");
        _balances[sender] -= amount;
        _balances[recipient] += amount;
        return true;
    }

    // IERC20Permit required functions for testing
    function permit(
        address owner,
        address spender,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external override {
        // Implement minimal logic for testing
    }

    function nonces(address owner) external view override returns (uint256) {
        return 0;
    }

    function DOMAIN_SEPARATOR() external view override returns (bytes32) {
        return keccak256("TestRwaERC20");
    }
}
