// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.7.0;

pragma experimental ABIEncoderV2;

library RwaDataTypes {
    struct RwaAuthorizationData {
        address operator;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }
}
