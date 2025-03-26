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
import "@balancer-labs/v2-interfaces/contracts/vault/IAuthorizer.sol";
import "@balancer-labs/v2-solidity-utils/contracts/openzeppelin/SafeERC20.sol";

import "@balancer-labs/v2-interfaces/contracts/vault/IPoolFees.sol";
import "@balancer-labs/v2-interfaces/contracts/vault/IVoter.sol";


contract PoolFees is IPoolFees {
    using SafeERC20 for IERC20;
    event UpdateRatio(bytes32 poolId, address token, uint256 feeAmount);
    event ClaimPoolTokenFees(bytes32 poolId, address token, uint256 feeAmount, address recipient);
    event ClaimBPTFees(bytes32 poolId, address token, uint256 feeAmount, address recipient);

    address public vault;
    address public voter;

    mapping(address => mapping(bytes32 => mapping(address => uint256))) public supplyIndex;
    mapping(address => mapping(bytes32 => mapping(address => uint256))) public claimable;
    mapping(bytes32 => mapping(address => uint256)) internal indexRatio;

    constructor(address _vault) {
        vault = _vault;
    }

    function _claimPoolTokensFees(
        bytes32 _poolId,
        address recipient
    )
        internal
        returns (address[] memory, uint256[] memory)
    {
        require(_poolId != bytes32(0), "invalid poolId");

        IERC20[] memory tokens;
        (tokens, , ) = IVault(vault).getPoolTokens(_poolId);
        require(tokens.length > 0, "no tokens in pool");
        address[] memory assets = new address[](tokens.length);
        uint[] memory claimableAmounts = new uint[](tokens.length);

        for (uint256 i = 0; i < tokens.length; i++) {
            _updateSupplyIndex(msg.sender, _poolId, address(tokens[i]));
            IERC20 token = tokens[i];
            uint256 claimableAmount = claimable[msg.sender][_poolId][address(token)];
            claimableAmounts[i] = claimableAmount;
            assets[i] = address(token);
            if (claimableAmount > 0) {
                claimable[msg.sender][_poolId][address(token)] = 0;
                token.safeTransfer(recipient, claimableAmount);
                emit ClaimPoolTokenFees(_poolId, address(token), claimableAmount, recipient);
            }
        }
        return (assets, claimableAmounts);
    }

    function _claimBPTFees(bytes32 _poolId, address recipient) internal{
        address _poolAddr;
        (_poolAddr, ) = IVault(vault).getPool(_poolId);
        IERC20[] memory tokens;
        (tokens, , ) = IVault(vault).getPoolTokens(_poolId);

        _updateSupplyIndex(msg.sender, _poolId, _poolAddr);
        uint256 claimableAmount = claimable[msg.sender][_poolId][_poolAddr];
        if (claimableAmount > 0) {
            claimable[msg.sender][_poolId][_poolAddr] = 0;
            uint256[] memory amountOuts = new uint256[](tokens.length);
            _exitPool(_poolId, recipient, _convertERC20ToIAsset(tokens), amountOuts, claimableAmount, false);
            emit ClaimBPTFees(_poolId, _poolAddr, claimableAmount, recipient);
        }
    }

    function _exitPool(
        bytes32 poolId,
        address recipient,
        IAsset[] memory assets,
        uint256[] memory minAmountsOut,
        uint256 bptAmount,
        bool toInternalBalance
    ) internal {
        require(recipient != address(0), "Recipient cannot be zero address");

        // Encode userData based on exitKind
        bytes memory userData;
        userData = abi.encode(uint8(1), bptAmount); // EXACT_BPT_IN_FOR_TOKENS_OUT kind

        IVault.ExitPoolRequest memory request = IVault.ExitPoolRequest({
            assets: assets,
            minAmountsOut: minAmountsOut,
            userData: userData,
            toInternalBalance: toInternalBalance
        });

        // Directly exit the pool and send tokens to recipient
        IVault(vault).exitPool(poolId, address(this), payable(recipient), request);
    }

    function claimPoolTokensFees(
        bytes32 _poolId,
        address recipient
    )
        external
        override
        returns (address[] memory tokens, uint256[] memory claimableAmounts)
    {
        address gauge = pool2Gauge(_poolId);
        require(gauge == msg.sender, "only allowed for gauge");
       (tokens, claimableAmounts) = _claimPoolTokensFees(_poolId, recipient);
    }

    function claimBPTFees(bytes32 _poolId, address recipient) external override {
        address authorizer = address(IVault(vault).getAuthorizer());
        bytes32 actionId = keccak256(abi.encodePacked(address(this), msg.sig));
        require(IAuthorizer(authorizer).canPerform(actionId, msg.sender, address(this)), "only allowed for authorizer");
        _claimBPTFees(_poolId, recipient);
    }

    function _convertERC20ToIAsset(IERC20[] memory tokens) internal pure returns (IAsset[] memory) {
        IAsset[] memory assets = new IAsset[](tokens.length);
        for (uint256 i = 0; i < tokens.length; i++) {
            assets[i] = IAsset(address(tokens[i]));
        }
        return assets;
    }

    function _updateSupplyIndex(
        address _recipient,
        bytes32 _poolId,
        address _token
    ) internal {
        address _poolAddr;
        (_poolAddr, ) = IVault(vault).getPool(_poolId);

        IERC20 lpToken = IERC20(_poolAddr);
        uint256 _supplied = lpToken.balanceOf(_recipient); // get LP balance of `recipient`
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
        (poolAddr, ) = IVault(vault).getPool(_poolId);
        require(msg.sender == poolAddr || msg.sender == vault, "only allowed for pool or vault");
        uint256 _ratio = (_feeAmount * 1e18) / IERC20(poolAddr).totalSupply(); // 1e18 adjustment is removed during claim
        if (_ratio > 0) {
            indexRatio[_poolId][_token] += _ratio;
        }
        emit UpdateRatio(_poolId, _token, _feeAmount);
    }

    function getIndexRatio(bytes32 _poolId, address _token) external view returns (uint256) {
        return indexRatio[_poolId][_token];
    }

    function setVoter(address _voter) external
    {
        address authorizer = address(IVault(vault).getAuthorizer());
        bytes32 actionId = keccak256(abi.encodePacked(address(this), msg.sig));
        require(IAuthorizer(authorizer).canPerform(actionId, msg.sender, address(this)), "only allowed for authorizer");
        voter = _voter;
    }

    function pool2Gauge(bytes32 _poolId) internal view returns (address) {
        address _poolAddr;
        (_poolAddr, ) = IVault(vault).getPool(_poolId);
        return IVoter(voter).gauges(_poolAddr);
    }
}
