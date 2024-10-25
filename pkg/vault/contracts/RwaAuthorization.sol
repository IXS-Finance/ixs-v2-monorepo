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
import "@balancer-labs/v2-interfaces/contracts/vault/IAuthorizer.sol";
import "@balancer-labs/v2-interfaces/contracts/solidity-utils/openzeppelin/IERC165.sol";

abstract contract RwaAuthorization is VaultAuthorization {
    bytes32 private constant _OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    event ApprovedRwaSwap(address indexed operator, address indexed spender, uint256 indexed nonce, uint256 deadline);

    constructor(IAuthorizer authorizer) VaultAuthorization(authorizer) {}

    function isRwaSwap(IAsset assetIn, IAsset assetOut) internal view returns (bool) {
        return
            checkInterface(address(assetIn), type(IRwaERC20).interfaceId) ||
            checkInterface(address(assetOut), type(IRwaERC20).interfaceId);
    }

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

    function verifyRwaSwapSignature(
        address to,
        RwaAuthorizationData memory authorization,
        uint256 deadline
    ) internal {
        IAuthorizer authorizer = IAuthorizer(address(getAuthorizer()));

        _require(
            authorizer.canPerform(_OPERATOR_ROLE, authorization.operator, address(this)),
            Errors.CALLER_IS_NOT_OWNER
        );

        bytes32 structHash = keccak256(
            abi.encode(_SWAP_TYPE_HASH, authorization.operator, to, getNextNonce(to), deadline)
        );

        _ensureValidSignature(
            authorization.operator,
            structHash,
            _toArraySignature(authorization.v, authorization.r, authorization.s),
            deadline,
            Errors.INVALID_SIGNATURE
        );

        emit ApprovedRwaSwap(authorization.operator, to, getNextNonce(to), deadline);
    }
}
