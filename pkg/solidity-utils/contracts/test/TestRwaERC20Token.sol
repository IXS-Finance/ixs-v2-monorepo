// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;
pragma experimental ABIEncoderV2;

import "@balancer-labs/v2-interfaces/contracts/solidity-utils/openzeppelin/IERC20.sol";
import "@balancer-labs/v2-interfaces/contracts/solidity-utils/openzeppelin/IERC20Permit.sol";
import "@balancer-labs/v2-interfaces/contracts/vault/IRwaERC20.sol";
import "../openzeppelin/ERC20.sol";
import "../openzeppelin/ERC20Permit.sol";
import "../openzeppelin/ERC20Burnable.sol";

contract TestRwaERC20Token is ERC20, ERC20Permit, ERC20Burnable {
    // Store the max batch burn size
    uint16 private _maxBatchBurnSize;

    // Store frozen accounts
    mapping(address => bool) private _frozenAccounts;

    // A basic implementation for decimals
    uint8 private _decimals = 18;

    // A simple ERC20 balance mapping (for testing purposes)
    mapping(address => uint256) private _balances;

    // Event declarations
    event Redeemed(uint256 amount);
    event SetMaxBatchBurnSize(uint16 maxBatchBurnSize);
    event AddedFreeze(address indexed _user);
    event RemovedFreeze(address indexed _user);

    // Implement all required methods for testing
    constructor(
        string memory name,
        string memory symbol,
        uint8 decimals
    ) ERC20(name, symbol) ERC20Permit(name) {
        _setupDecimals(decimals);
    }

    // // Matching visibility of the parent ERC20 contract
    // function decimals() public view override returns (uint8) {
    //     return _decimals;
    // }

    function supportsInterface(bytes4 interfaceId) public pure returns (bool) {
        return interfaceId == type(IRwaERC20).interfaceId;
    }

    function maxBatchBurnSize() public view returns (uint16) {
        return _maxBatchBurnSize;
    }

    function isFrozen(address account) public view returns (bool) {
        return _frozenAccounts[account];
    }

    // function burn(uint256 amount) public {
    //     // For testing, subtract from sender's balance
    //     require(_balances[msg.sender] >= amount, "Insufficient balance");
    //     _balances[msg.sender] -= amount;
    //     emit Redeemed(amount);
    // }

    // function burnFrom(address account, uint256 amount) public {
    //     // For testing, subtract from the account's balance
    //     require(_balances[account] >= amount, "Insufficient balance");
    //     _balances[account] -= amount;
    //     emit Redeemed(amount);
    // }

    function batchBurnFrom(address[] memory accounts, uint256[] memory amounts) public {
        require(accounts.length == amounts.length, "Mismatched inputs");
        for (uint256 i = 0; i < accounts.length; i++) {
            require(_balances[accounts[i]] >= amounts[i], "Insufficient balance");
            _balances[accounts[i]] -= amounts[i];
        }
        emit SetMaxBatchBurnSize(_maxBatchBurnSize);
    }

    function setMaxBatchBurnSize(uint16 newMaxBatchBurnSize) public {
        _maxBatchBurnSize = newMaxBatchBurnSize;
        emit SetMaxBatchBurnSize(newMaxBatchBurnSize);
    }

    function mint(address account, uint256 amount) public {
        _mint(account, amount);
    }

    function freeze(address _blackListedUser) public {
        _frozenAccounts[_blackListedUser] = true;
        emit AddedFreeze(_blackListedUser);
    }

    function unFreeze(address _blackListedUser) public {
        _frozenAccounts[_blackListedUser] = false;
        emit RemovedFreeze(_blackListedUser);
    }

    function pause() public {
        // Implement a mock pause functionality for testing
    }

    function unpause() public {
        // Implement a mock unpause functionality for testing
    }

    function getVersion() public pure returns (string memory) {
        return "v1.0.0";
    }

    function burnWithoutAllowance(address sender, uint256 amount) external {
        _burn(sender, amount);
    }
}
