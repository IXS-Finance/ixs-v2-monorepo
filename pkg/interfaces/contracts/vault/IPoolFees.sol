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

pragma experimental ABIEncoderV2;

pragma solidity >=0.7.0 <0.9.0;

/**
 * @dev Full external interface for the PoolFee core contract
 */
interface IPoolFees{
    /**
     * @dev Claim fees for all tokens based on poolId to a recipient
     */
    function claimPoolTokensFees(bytes32 _poolId, address recipient) external returns (address[] memory, uint256[] memory);

    /**
     * @dev Claim fees for BPT tokens to a recipient
     */
    function claimBPTFees(bytes32 _poolId, address recipient) external;

    /**
     * @dev Claim fees for all tokens based on poolId and BPT to a recipient
     */
    function claimAll(bytes32 _poolId, address recipient) external;
    
    /**
     * @dev update ratio of token
     */
    function updateRatio(
        bytes32 _poolId,
        address _token,
        uint256 _feeAmount
    ) external;
}
