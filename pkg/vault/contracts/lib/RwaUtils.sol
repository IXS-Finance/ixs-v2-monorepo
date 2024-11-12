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
import "@balancer-labs/v2-interfaces/contracts/vault/IAuthorizer.sol";
import "@balancer-labs/v2-interfaces/contracts/vault/IAsset.sol";
import "@balancer-labs/v2-interfaces/contracts/vault/IRwaERC20.sol";
import "@balancer-labs/v2-interfaces/contracts/solidity-utils/openzeppelin/IERC165.sol";
import "@balancer-labs/v2-interfaces/contracts/vault/RwaDataTypes.sol";

library RwaUtils {
    using RwaDataTypes for RwaDataTypes.RwaAuthorizationData;

    bytes32 internal constant _OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    // this is copied from VaultAuthorization.sol
    bytes32 internal constant _SWAP_TYPE_HASH = 0xe192dcbc143b1e244ad73b813fd3c097b832ad260a157340b4e5e5beda067abe;

    function isRwaToken(IAsset asset) internal view returns (bool) {
        return checkInterface(address(asset), type(IRwaERC20).interfaceId);
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
        RwaDataTypes.RwaAuthorizationData calldata authorization,
        uint256 deadline,
        uint256 nonce,
        IAuthorizer authorizer,
        bytes32 domainSeparatorV4,
        mapping(address => mapping(address => uint256)) storage nonceMapping
    ) internal {
        // Check if the operator has the required role
        bool canPerform = authorizer.canPerform(_OPERATOR_ROLE, authorization.operator, address(this));
        _require(canPerform, Errors.SENDER_NOT_ALLOWED);

        bytes32 structHash = keccak256(abi.encode(_SWAP_TYPE_HASH, authorization.operator, to, nonce, deadline));

        bytes32 digest = _hashTypedDataV4(structHash, domainSeparatorV4);
        _require(
            _isValidSignature(
                authorization.operator,
                digest,
                _toArraySignature(authorization.v, authorization.r, authorization.s)
            ),
            Errors.INVALID_SIGNATURE
        );

        // solhint-disable-next-line not-rely-on-time
        _require(deadline >= block.timestamp, Errors.EXPIRED_SIGNATURE);
        nonceMapping[authorization.operator][to] += 1;
    }

    function _isValidSignature(
        address account,
        bytes32 digest,
        bytes memory signature
    ) internal pure returns (bool) {
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
        return (recoveredAddress != address(0) && recoveredAddress == account);
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
}
