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
import "@balancer-labs/v2-solidity-utils/contracts/openzeppelin/EIP712.sol";


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

struct SignatureParams {
    uint8 v;
    bytes32 r;
    bytes32 s;
}
contract WeightedPoolFactory is Authentication, BasePoolFactory, ReentrancyGuard, EIP712{
    IRwaRegistry public rwaRegistry;

    // keccak256(
    //     "CreateRWAPool(string memory name,string memory symbol,address[] memory tokens,uint256[] memory normalizedWeights,IRateProvider[] memory rateProviders,uint256 swapFeePercentage,address owner,bool[] memory isRWA,uint256 deadline,uint256 nonce)");
    bytes32 private constant RWAPOOL_TYPEHASH = 0x935c5143f85d7e522000603cb9872870f67b2398d6c7c8dde472b19fbfbf417a;    
    IAuthorizer private _authorizer;
    bytes32 public constant OPERATOR_ROLE = 0x97667070c54ef182b0f5858b034beac1b6f3089aa2d3188bb1e8929f4fa9b929; //keccak256("OPERATOR_ROLE");
    mapping(address => uint256) internal _nextNonce;

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

    function createRWAPool(
        WeightedPoolCreationParams memory params,
        uint256 deadline,
        bytes32 salt,
        SignatureParams calldata signature
    ) external returns (address) {
        uint256 tokensLength = params.tokens.length;
        verifyRwaSwapSignature(params, deadline, signature);

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

    function verifyRwaSwapSignature(
        WeightedPoolCreationParams memory params,
        uint256 deadline,
        SignatureParams calldata sig
    ) internal {
        bytes32 structHash = getPoolCreationHash(params, deadline, _nextNonce[msg.sender]);

        bytes32 digest = _hashTypedDataV4(structHash,  _domainSeparatorV4());
        _isValidSignature(
                digest,
                _toArraySignature(sig.v, sig.r, sig.s)
            );

        // solhint-disable-next-line not-rely-on-time
        _require(deadline >= block.timestamp, Errors.EXPIRED_SIGNATURE);

        _nextNonce[msg.sender] += 1;
    }

    function _isValidSignature(
        bytes32 digest,
        bytes memory signature
    ) internal view returns (address) {
        _require(signature.length == 65, Errors.MALFORMED_SIGNATURE);

        bytes32 r;
        bytes32 s;
        uint8 v;

        // ecrecover takes the r, s and v signature parameters, and the only way to get them is to use assembly.
        // solhint-disable-next-line no-inline-assembly
        assembly {
            r := mload(add(signature, 0x20))
            s := mload(add(signature, 0x40))
            v := byte(0, mload(add(signature, 0x60)))
        }

        address recoveredAddress = ecrecover(digest, v, r, s);

        // ecrecover returns the zero address on recover failure, so we need to handle that explicitly.
        bool canPerform = _authorizer.canPerform(OPERATOR_ROLE, recoveredAddress, address(this));
        _require(canPerform, Errors.INVALID_SIGNATURE);
        _require(recoveredAddress != address(0), Errors.INVALID_SIGNATURE);
        return recoveredAddress;
        
    }

    function _toArraySignature(
        uint8 v,
        bytes32 r,
        bytes32 s
    ) internal pure returns (bytes memory) {
        bytes memory signature = new bytes(65);
        // solhint-disable-next-line no-inline-assembly
        assembly {
            mstore(add(signature, 32), r)
            mstore(add(signature, 64), s)
            mstore8(add(signature, 96), v)
        }

        return signature;
    }

    function _hashTypedDataV4(bytes32 structHash, bytes32 domainSeparatorV4) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", domainSeparatorV4, structHash));
    }
    
    function getNextNonceByOperator(address account) public view returns (uint256) {
        return _nextNonce[account];
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
