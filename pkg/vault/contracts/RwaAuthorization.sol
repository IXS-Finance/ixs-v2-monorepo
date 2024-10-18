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
import "@balancer-labs/v2-interfaces/contracts/vault/IAccessControlAuthorizer.sol";
import "@balancer-labs/v2-interfaces/contracts/solidity-utils/openzeppelin/IERC165.sol";

abstract contract RwaAuthorization is VaultAuthorization {
    bytes32 private constant _OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    mapping(address => uint256) public swapNonces;

    event ApprovedRwaSwap(address indexed operator, address indexed spender, uint256 indexed nonce, uint256 deadline);

    modifier validateAuthorizations(
        address to,
        RwaAuthorizationData memory authorizationIn,
        RwaAuthorizationData memory authorizationOut,
        IAsset assetIn,
        IAsset assetOut,
        uint256 deadline
    ) {
        // in dex v2, tokens are not physically transferred between pools so this check may not neccessary
        // if (IIxsV2Factory(factory).isPair(to)) {
        //     _;
        //     return;
        // }

        if (checkInterface(address(assetIn), type(IRwaERC20).interfaceId)) {
            _verifySwapSignature(
                authorizationIn.operator,
                to,
                deadline,
                authorizationIn.v,
                authorizationIn.r,
                authorizationIn.s
            );
        }
        if (checkInterface(address(assetOut), type(IRwaERC20).interfaceId)) {
            _verifySwapSignature(
                authorizationOut.operator,
                to,
                deadline,
                authorizationOut.v,
                authorizationOut.r,
                authorizationOut.s
            );
        }
        _;
    }

    constructor(IAuthorizer authorizer) VaultAuthorization(authorizer) {}

    function checkInterface(address _contract, bytes4 _interfaceId) internal view returns (bool) {
        if (_contract == address(0)) {
            return false;
        }
        try IERC165(_contract).supportsInterface(_interfaceId) returns (bool result) {
            return result;
        } catch {
            return false;
        }
    }

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

        _require(recoveredAddress == operator, Errors.RWA_INVALID_SIGNATURE);
        IAccessControlAuthorizer authorizer = IAccessControlAuthorizer(address(getAuthorizer()));

        _require(authorizer.hasRole(keccak256("OPERATOR_ROLE"), operator), Errors.RWA_OPERATOR_FORBIDDEN);

        emit ApprovedRwaSwap(operator, spender, swapNonces[spender], deadline);
        swapNonces[spender]++;
    }
}
