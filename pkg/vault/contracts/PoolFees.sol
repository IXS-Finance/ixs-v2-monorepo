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
    event UpdateFeesAmount(bytes32 poolId, address token, uint256 feeAmount);
    event ClaimPoolTokenFees(bytes32 poolId, address token, uint256 feeAmount, address recipient);
    event ClaimBPTFees(bytes32 poolId, address token, uint256 feeAmount, address recipient);
    event VoterChanged(address voter);

    address public vault;
    address public voter;

    // pool Id => token address => fee amount
    mapping(bytes32 => mapping(address => uint256)) public feesAmounts;

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
            IERC20 token = tokens[i];
            uint256 claimableAmount = feesAmounts[_poolId][address(token)];
            claimableAmounts[i] = claimableAmount;
            assets[i] = address(token);
            if (claimableAmount > 0) {
                feesAmounts[_poolId][address(token)] = 0;
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

        uint256 claimableAmount = feesAmounts[_poolId][_poolAddr];
        if (claimableAmount > 0) {
            feesAmounts[_poolId][_poolAddr] = 0;
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

    // @dev claim fees for all tokens based on poolId to a recipient, only allowed for gauge
    // @param _poolId pool id
    // @param recipient recipient address
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

    // @dev claim fees for BPT tokens to a recipient, only allowed for team
    // @param _poolId pool id
    // @param recipient recipient address
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


    /**
     * @dev update fee amount for a token in a pool, only allowed for pool or vault
     * @param _poolId pool id
     * @param _token tokenIn address
     * @param _feeAmount swapping fee
     */
    function updateFeesAmount(
        bytes32 _poolId,
        address _token,
        uint256 _feeAmount
    ) external override{
        // Only update on this pool if there is a fee
        if (_feeAmount == 0) return;
        address poolAddr;
        (poolAddr, ) = IVault(vault).getPool(_poolId);
        require(msg.sender == poolAddr || msg.sender == vault, "only allowed for pool or vault");
        feesAmounts[_poolId][_token] += _feeAmount;
        emit UpdateFeesAmount(_poolId, _token, _feeAmount);
    }

    function getFeesAmounts(bytes32 _poolId, address _token) external view returns (uint256) {
        return feesAmounts[_poolId][_token];
    }

    function setVoter(address _voter) external
    {
        address authorizer = address(IVault(vault).getAuthorizer());
        bytes32 actionId = keccak256(abi.encodePacked(address(this), msg.sig));
        require(IAuthorizer(authorizer).canPerform(actionId, msg.sender, address(this)), "only allowed for authorizer");
        voter = _voter;
        emit VoterChanged(_voter);
    }

    function pool2Gauge(bytes32 _poolId) internal view returns (address) {
        address _poolAddr;
        (_poolAddr, ) = IVault(vault).getPool(_poolId);
        return IVoter(voter).gauges(_poolAddr);
    }
}
