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

import "@balancer-labs/v2-interfaces/contracts/vault/IAuthorizer.sol";
import "@balancer-labs/v2-interfaces/contracts/vault/IAsset.sol";
import "@balancer-labs/v2-interfaces/contracts/vault/IVault.sol";
import "@balancer-labs/v2-interfaces/contracts/vault/RwaDataTypes.sol";

interface IRwaRegistry {
    event ApprovedRwaSwap(address indexed operator, address indexed spender, uint256 indexed nonce, uint256 deadline);
    event AddedToken(address tokenAddress, address operator);
    event RemovedToken(address tokenAddress, address operator);

    function setAuthorizer(IAuthorizer newAuthorizer) external;

    /**
     * @dev Returns the next nonce used by an operator to issue the signature for the user.
     */
    function getNextNonceByOperator(address operator, address user) external view returns (uint256);

    function addToken(address tokenAddress) external;

    function removeToken(address tokenAddress) external;

    function isRwaToken(address tokenAddress) external view returns (bool);

    function isRwaSwap(IAsset assetIn, IAsset assetOut) external view returns (bool);

    function isRwaBatchSwap(IVault.BatchSwapStep[] calldata swaps, IAsset[] calldata assets)
        external
        view
        returns (bool);

    function verifyRwaSwapSignature(
        address to,
        RwaDataTypes.RwaAuthorizationData calldata authorization,
        uint256 deadline,
        bytes32 domainSeparatorV4
    ) external;

    struct RwaAuthorizationData {
        address operator;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }
}
