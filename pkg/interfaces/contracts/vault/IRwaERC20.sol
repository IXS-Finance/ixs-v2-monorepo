// SPDX-License-Identifier: MIT
pragma solidity >=0.7.0 <0.9.0;
pragma experimental ABIEncoderV2;

import "../solidity-utils/openzeppelin/IERC20.sol";
import "../solidity-utils/openzeppelin/IERC20Permit.sol";

interface IRwaERC20 is IERC20, IERC20Permit {
    // Events
    event SetMaxBatchBurnSize(uint16 maxBatchBurnSize);
    event Redeemed(uint256 amount);
    event AddedFreeze(address indexed _user);
    event RemovedFreeze(address indexed _user);

    // Functions
    function maxBatchBurnSize() external view returns (uint16);

    function isFrozen(address account) external view returns (bool);

    function batchBurnFrom(address[] memory accounts, uint256[] memory amounts) external;

    function setMaxBatchBurnSize(uint16 _maxBatchBurnSize) external;

    function mint(address account, uint256 amount) external;

    function freeze(address _blackListedUser) external;

    function unFreeze(address _blackListedUser) external;

    function pause() external;

    function unpause() external;

    function getVersion() external pure returns (string memory);
}
