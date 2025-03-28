// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.7.0;

contract MockVoter  {
    mapping(address => address) private _gauges;

    function setGauge(address _pool, address _gauge) external {
        _gauges[_pool] = _gauge;
    }

    function gauges(address _pool) external view returns (address) {
        return _gauges[_pool];
    }

}
