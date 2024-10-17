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
import "./VaultAuthorization.sol";
import "@balancer-labs/v2-interfaces/contracts/vault/IAuthorizer.sol";
import "@balancer-labs/v2-interfaces/contracts/vault/IAsset.sol";
import "@balancer-labs/v2-interfaces/contracts/vault/IRwaERC20.sol";
import "@balancer-labs/v2-interfaces/contracts/solidity-utils/openzeppelin/IERC165.sol";

abstract contract RwaAuthorization is VaultAuthorization {
    mapping(address => uint256) public swapNonces;

    struct RwaAuthorizationData {
        address operator;
        uint256 deadline;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    event ApprovedRwaSwap(address indexed operator, address indexed spender, uint256 indexed nonce, uint256 deadline);

    modifier validateAuthorizations(
        address to,
        RwaAuthorizationData[] memory authorizations,
        IAsset assetIn,
        IAsset assetOut
    ) {
        // in dex v2, tokens are not physically transferred between pools so this check may not neccessary
        // if (IIxsV2Factory(factory).isPair(to)) {
        //     _;
        //     return;
        // }

        RwaAuthorizationData memory authorization0 = authorizations[0];
        RwaAuthorizationData memory authorization1 = authorizations[1];
        if (IERC165(address(assetIn)).supportsInterface(type(IRwaERC20).interfaceId)) {
            _verifySwapSignature(
                authorization0.operator,
                to,
                authorization0.deadline,
                authorization0.v,
                authorization0.r,
                authorization0.s
            );
        }
        if (IERC165(address(assetOut)).supportsInterface(type(IRwaERC20).interfaceId)) {
            _verifySwapSignature(
                authorization1.operator,
                to,
                authorization1.deadline,
                authorization1.v,
                authorization1.r,
                authorization1.s
            );
        }
        _;
    }

    constructor(IAuthorizer authorizer) VaultAuthorization(authorizer) {}

    function _verifySwapSignature(
        address operator,
        address spender,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) private {
        _require(operator != address(0), Errors.RWA_UNAUTHORIZED_SWAP);

        _require(block.timestamp <= deadline, Errors.RWA_EXPIRED_SWAP);

        bytes32 digest = _hashTypedDataV4(
            keccak256(abi.encode(_SWAP_TYPE_HASH, operator, spender, swapNonces[spender], deadline))
        );

        address recoveredAddress = ecrecover(digest, v, r, s);

        _require(recoveredAddress != address(0) && recoveredAddress == operator, Errors.RWA_INVALID_SIGNATURE);
        _require(address(getAuthorizer()) == operator, Errors.RWA_OPERATOR_FORBIDDEN);

        emit ApprovedRwaSwap(operator, spender, swapNonces[spender], deadline);
        swapNonces[spender]++;
    }
}
