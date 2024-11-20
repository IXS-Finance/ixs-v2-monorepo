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

import "@balancer-labs/v2-solidity-utils/contracts/openzeppelin/SafeERC20.sol";

import "@balancer-labs/v2-interfaces/contracts/vault/IPoolFees.sol";


contract PoolFees is IPoolFees {
    using SafeERC20 for IERC20;

    address public vault;

    mapping(address => mapping(bytes32 => mapping(address => uint256))) public supplyIndex;
    mapping(address => mapping(bytes32 => mapping(address => uint256))) public claimable;
    mapping(bytes32 => mapping(address => uint256)) internal indexRatio;

    bytes32 constant noPoolId = bytes32(0);

    constructor(address _vault) {
        vault = _vault;
    }

    function _claimPoolTokensFees(bytes32 _poolId, address recipient) internal {
        require(_poolId != bytes32(0), "invalid poolId");

        IERC20[] memory tokens;
        (tokens, , ) = IVault(vault).getPoolTokens(_poolId);
        require(tokens.length > 0, "no tokens in pool");
        for (uint256 i = 0; i < tokens.length; i++) {
            _updatePoolSupplyIndex(msg.sender, _poolId, address(tokens[i]));
            IERC20 token = tokens[i];
            uint256 claimableAmount = claimable[msg.sender][_poolId][address(token)];
            if (claimableAmount > 0) {
                claimable[msg.sender][_poolId][address(token)] = 0;
                token.safeTransfer(recipient, claimableAmount);
            }
        }
    }

    function _claimBPTFees(address _BPT, address recipient) internal{
        IERC20 BPT = IERC20(_BPT);
        _updateBPTSupplyIndex(msg.sender, _BPT);
        uint256 claimableAmount = claimable[msg.sender][bytes32(0)][_BPT];
        if (claimableAmount > 0) {
            claimable[msg.sender][bytes32(0)][_BPT] = 0;
            BPT.safeTransfer(recipient, claimableAmount);
        }
    }

    function claimPoolTokensFees(bytes32 _poolId, address recipient) external override{
        _claimPoolTokensFees(_poolId, recipient);
    }

    function claimBPTFees(address _BPT, address recipient) external override{
        _claimBPTFees(_BPT, recipient);
    }

    function claimAll(bytes32 _poolId, address _BPT, address recipient) external override{
        _claimPoolTokensFees(_poolId, recipient);
        _claimBPTFees(_BPT, recipient);
    }

    function _updatePoolSupplyIndex(
        address _recipient,
        bytes32 _poolId,
        address _token
    ) internal {
        address _poolAddr;
        (_poolAddr, ) = IVault(vault).getPool(_poolId);

        IERC20 lpToken = IERC20(_poolAddr);
        uint256 _supplied = lpToken.balanceOf(_recipient); // get LP balance of `recipient`
        // uint256 _indexRatio = IVault(vault).getIndexRatio(_poolId, address(token)); // get global index for accumulated fees
        uint256 _indexRatio = indexRatio[_poolId][_token]; // get global index for accumulated fees

        if (_supplied > 0) {
            uint256 _supplyIndex = supplyIndex[_recipient][_poolId][_token]; // get last adjusted index for _recipient
            uint256 _index0 = _indexRatio; // get global index for accumulated fees
            supplyIndex[_recipient][_poolId][_token] = _index0; // update user current position to global position
            uint256 _delta0 = _index0 - _supplyIndex; // see if there is any difference that need to be accrued
            if (_delta0 > 0) {
                uint256 _share = (_supplied * _delta0) / 1e18; // add accrued difference for each supplied token
                claimable[_recipient][_poolId][_token] += _share;
            }
        } else {
            supplyIndex[_recipient][_poolId][_token] = _indexRatio;
        }
    }

    function _updateBPTSupplyIndex(
        address _recipient,
        address _token
    ) internal {
        IERC20 token = IERC20(_token);
        uint256 _supplied = token.balanceOf(_recipient); // get LP balance of `recipient`
        // uint256 _indexRatio = IVault(vault).getIndexRatio(noPoolId, address(token)); // get global index for accumulated fees
        uint256 _indexRatio = indexRatio[noPoolId][_token]; // get global index for accumulated fees
        if (_supplied > 0) {
            uint256 _supplyIndex = supplyIndex[_recipient][noPoolId][_token]; // get last adjusted index for _recipient
            uint256 _index0 = _indexRatio; // get global index for accumulated fees
            supplyIndex[_recipient][noPoolId][_token] = _index0; // update user current position to global position
            uint256 _delta0 = _index0 - _supplyIndex; // see if there is any difference that need to be accrued
            if (_delta0 > 0) {
                uint256 _share = (_supplied * _delta0) / 1e18; // add accrued difference for each supplied token
                claimable[_recipient][noPoolId][_token] += _share;
            }
        } else {
            supplyIndex[_recipient][noPoolId][_token] = _indexRatio;
        }
    }

    /**
     * @dev update index ratio after each swap
     * @param _poolId pool id
     * @param _token tokenIn address
     * @param _feeAmount swapping fee
     */
    function updateRatio(
        bytes32 _poolId,
        address _token,
        uint256 _feeAmount
    ) external override{
        // Only update on this pool if there is a fee
        if (_feeAmount == 0) return;
        address poolAddr;
        if (_poolId == bytes32(0)) {
            poolAddr = _token;
        }
        else {
            (poolAddr, ) = IVault(vault).getPool(_poolId);
        }
        require(msg.sender == poolAddr || msg.sender == vault, "only allowed for pool or vault");
        uint256 _ratio = (_feeAmount * 1e18) / IERC20(poolAddr).totalSupply(); // 1e18 adjustment is removed during claim
        if (_ratio > 0) {
            indexRatio[_poolId][_token] += _ratio;
        }
    }

    function getIndexRatio(bytes32 _poolId, address _token) external view returns (uint256) {
        return indexRatio[_poolId][_token];
    }
}
