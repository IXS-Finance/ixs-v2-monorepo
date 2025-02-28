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

import "@balancer-labs/v2-interfaces/contracts/vault/IVault.sol";

import "@balancer-labs/v2-pool-utils/contracts/factories/BasePoolFactory.sol";
import "@balancer-labs/v2-interfaces/contracts/vault/IRwaRegistry.sol";
import "@balancer-labs/v2-interfaces/contracts/vault/IAuthorizer.sol";
import "@balancer-labs/v2-solidity-utils/contracts/helpers/Authentication.sol";
import "@balancer-labs/v2-solidity-utils/contracts/openzeppelin/ReentrancyGuard.sol";
import "@balancer-labs/v2-solidity-utils/contracts/helpers/EOASignaturesValidator.sol";


import "./WeightedPool.sol";
struct WeightedPoolCreationParams {
    string name;
    string symbol;
    IERC20[] tokens;
    uint256[] normalizedWeights;
    IRateProvider[] rateProviders;
    uint256 swapFeePercentage;
    address owner;
    bool[] isRWA;
}
contract WeightedPoolFactory is Authentication, BasePoolFactory, ReentrancyGuard, EOASignaturesValidator{
    bytes32 private constant RWAPOOL_TYPEHASH = 0x935c5143f85d7e522000603cb9872870f67b2398d6c7c8dde472b19fbfbf417a;// keccak256("CreateRWAPool(string memory name,string memory symbol,address[] memory tokens,uint256[] memory normalizedWeights,IRateProvider[] memory rateProviders,uint256 swapFeePercentage,address owner,bool[] memory isRWA,uint256 deadline,uint256 nonce)");    
    bytes32 public constant OPERATOR_ROLE = 0x97667070c54ef182b0f5858b034beac1b6f3089aa2d3188bb1e8929f4fa9b929; //keccak256("OPERATOR_ROLE");
    IRwaRegistry public rwaRegistry;
    IAuthorizer private _authorizer;

    constructor(
        IVault vault,
        IProtocolFeePercentagesProvider protocolFeeProvider,
        uint256 initialPauseWindowDuration,
        uint256 bufferPeriodDuration,
        IAuthorizer authorizer
    )
        BasePoolFactory(
            vault,
            protocolFeeProvider,
            initialPauseWindowDuration,
            bufferPeriodDuration,
            type(WeightedPool).creationCode
        ) EIP712("WeightedPoolFactory", "1")
    {
        // solhint-disable-previous-line no-empty-blocks
        _authorizer = authorizer;
    }

    function setAuthorizer(IAuthorizer newAuthorizer) external nonReentrant authenticate {
        _setAuthorizer(newAuthorizer);
    }

    function _setAuthorizer(IAuthorizer newAuthorizer) private {
        _authorizer = newAuthorizer;
    }

    /**
     * @dev Deploys a new `WeightedPool`.
     */
    function create(
        string memory name,
        string memory symbol,
        IERC20[] memory tokens,
        uint256[] memory normalizedWeights,
        IRateProvider[] memory rateProviders,
        uint256 swapFeePercentage,
        address owner,
        bytes32 salt
    ) external returns (address) {
        (uint256 pauseWindowDuration, uint256 bufferPeriodDuration) = getPauseConfiguration();

        return
            _create(
                abi.encode(
                    WeightedPool.NewPoolParams({
                        name: name,
                        symbol: symbol,
                        tokens: tokens,
                        normalizedWeights: normalizedWeights,
                        rateProviders: rateProviders,
                        assetManagers: new address[](tokens.length), // Don't allow asset managers,
                        swapFeePercentage: swapFeePercentage
                    }),
                    getVault(),
                    getProtocolFeePercentagesProvider(),
                    pauseWindowDuration,
                    bufferPeriodDuration,
                    owner
                ),
                salt
            );
    }

    /**
     * @dev Deploys a new `WeightedPool` for RWA tokens.
     */
    function createRWAPool(
        WeightedPoolCreationParams memory params,
        uint256 deadline,
        bytes32 salt,
        RwaDataTypes.RwaAuthorizationData calldata authorization
    ) external returns (address) {
        bool canPerform = _authorizer.canPerform(OPERATOR_ROLE, authorization.operator, address(this));
        _require(canPerform, Errors.INVALID_SIGNATURE);

        uint256 tokensLength = params.tokens.length;
        verifySignature(authorization.operator, params, deadline, authorization);

        {
            for (uint256 i = 0; i < tokensLength; i++) {
                require(address(params.tokens[i]) != address(0x0), "Token address cannot be 0x0");
                require(tokensLength == params.isRWA.length, "isRWA must be the same length as tokens");
                if (params.isRWA[i] && rwaRegistry.isRwaToken(address(params.tokens[i])) == false) {
                    rwaRegistry.addToken(address(params.tokens[i]));
                }
            }
        }

        (uint256 pauseWindowDuration, uint256 bufferPeriodDuration) = getPauseConfiguration();
        
        return
            _create(
                _encode(params, pauseWindowDuration, bufferPeriodDuration), salt);
    }

    // Function to hash the pool creation (EIP-712 format)
    function getPoolCreationHash(WeightedPoolCreationParams memory params, uint256 deadline, uint256 nonce) public pure returns (bytes32) {
        return keccak256(
            abi.encode(
                RWAPOOL_TYPEHASH,
                params.name,
                params.symbol,
                params.tokens,
                params.normalizedWeights,
                params.rateProviders,
                params.swapFeePercentage,
                params.owner,
                params.isRWA,
                deadline,
                nonce
            )
        );
    }

    /**
     * @dev Verifies the signature of the pool creation.
     */
    function verifySignature(
        address _account,
        WeightedPoolCreationParams memory params,
        uint256 deadline,
        RwaDataTypes.RwaAuthorizationData calldata authorization
    ) internal {
        bytes32 structHash = getPoolCreationHash(params, deadline, _nextNonce[msg.sender]);
        _ensureValidSignature(_account, structHash, _toArraySignature(authorization.v, authorization.r, authorization.s), deadline, Errors.INVALID_SIGNATURE);
    }
    
    function _encode(WeightedPoolCreationParams memory params, uint256 pauseWindowDuration, uint256 bufferPeriodDuration) internal view returns (bytes memory) {
        return abi.encode(
                    WeightedPool.NewPoolParams({
                        name: params.name,
                        symbol: params.symbol,
                        tokens: params.tokens,
                        normalizedWeights: params.normalizedWeights,
                        rateProviders: params.rateProviders,
                        assetManagers: new address[](params.tokens.length), // Don't allow asset managers,
                        swapFeePercentage: params.swapFeePercentage
                    }),
                    getVault(),
                    getProtocolFeePercentagesProvider(),
                    pauseWindowDuration,
                    bufferPeriodDuration,
                    params.owner
                );
    }
}
