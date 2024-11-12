// SPDX-License-Identifier: GPL-3.0-or-later
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.

pragma solidity ^0.7.0;
pragma experimental ABIEncoderV2;

import "@balancer-labs/v2-interfaces/contracts/solidity-utils/helpers/BalancerErrors.sol";
import "@balancer-labs/v2-interfaces/contracts/solidity-utils/openzeppelin/IERC20.sol";
import "@balancer-labs/v2-interfaces/contracts/vault/IVault.sol";

import "@balancer-labs/v2-solidity-utils/contracts/openzeppelin/ReentrancyGuard.sol";
import "@balancer-labs/v2-solidity-utils/contracts/math/FixedPoint.sol";
import "@balancer-labs/v2-solidity-utils/contracts/openzeppelin/SafeERC20.sol";

import "./ProtocolFeesCollector.sol";
import "./VaultAuthorization.sol";

import "@balancer-labs/v2-interfaces/contracts/vault/IPoolFees.sol";

// import "./PoolRegistry.sol";

contract PoolFee is IPoolFees {
    using SafeERC20 for IERC20;

    address public vault;

    mapping(address => mapping(bytes32 => mapping(address => uint256))) public supplyIndex;
    mapping(address => mapping(bytes32 => mapping(address => uint256))) public claimable;

    constructor(address _vault) {
        vault = _vault;
    }

    function claimFees(bytes32 _poolId) external override {
        // check if poolId is valid
        require(_poolId != bytes32(0), "invalid poolId");

        //check poolId registration
        // _ensureRegisteredPool(_poolId); // Should never happen as Pool IDs are unique.

        // claim fees
        IERC20[] memory tokens;
        (tokens, , ) = IVault(vault).getPoolTokens(_poolId);
        require(tokens.length > 0, "no tokens in pool");
        for (uint256 i = 0; i < tokens.length; i++) {
            _updateSupplyIndex(msg.sender, _poolId, address(tokens[i]));
            IERC20 token = IERC20(tokens[i]);
            uint256 claimableAmount = claimable[msg.sender][_poolId][address(token)];
            if (claimableAmount > 0) {
                claimable[msg.sender][_poolId][address(token)] = 0;
                token.safeTransfer(msg.sender, claimableAmount);
            }
        }
    }

    function _updateSupplyIndex(
        address _recipient,
        bytes32 _poolId,
        address _token
    ) internal {
        IERC20 token = IERC20(_token);
        uint256 _supplied = token.balanceOf(_recipient); // get LP balance of `recipient`
        uint256 _indexRatio = IVault(vault).getIndexRatio(_poolId, address(token)); // get global index for accumulated fees
        if (_supplied > 0) {
            uint256 _supplyIndex = supplyIndex[_recipient][_poolId][address(token)]; // get last adjusted index for _recipient
            uint256 _index0 = _indexRatio; // get global index for accumulated fees
            supplyIndex[_recipient][_poolId][address(token)] = _index0; // update user current position to global position
            uint256 _delta0 = _index0 - _supplyIndex; // see if there is any difference that need to be accrued
            if (_delta0 > 0) {
                uint256 _share = (_supplied * _delta0) / 1e18; // add accrued difference for each supplied token
                claimable[_recipient][_poolId][address(token)] += _share;
            }
        } else {
            supplyIndex[_recipient][_poolId][address(token)] = _indexRatio;
        }
    }
}
