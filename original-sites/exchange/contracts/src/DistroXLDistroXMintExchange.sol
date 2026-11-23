// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SwapBurnMintExchangeCore} from "./SwapBurnMintExchangeCore.sol";

/// @title DistroXLDistroXMintExchange
/// @notice DistroX to LDistroX burn-and-mint exchange.
contract DistroXLDistroXMintExchange is SwapBurnMintExchangeCore {
    address public constant DISTROX = 0xA1198e47Ac3D89903D7eCFd04a14b8Bfd72d7B03;
    address public constant LDISTROX = 0xfC961146971679Cc4E731F60D72B60eb3dd8b036;
    address public constant PULSEX_V2_ROUTER = 0x165C3410fC91EF562C50559f7d2289fEbed552d9;
    address public constant WPLS = 0xA1077a294dDE1B09bB078844df40758a5D0f9a27;
    address public constant LIMITED_TREASURY = 0x175750eA3aDed69d2375ffe044BFb6E46ec90702;
    address public constant MANAGEMENT_WALLET = 0xDBA19652f7Ed3f3AE6266c91669C6083ba8cE557;
    address public constant INITIAL_OWNER = 0x175750eA3aDed69d2375ffe044BFb6E46ec90702;

    constructor()
        SwapBurnMintExchangeCore(
            DISTROX,
            LDISTROX,
            PULSEX_V2_ROUTER,
            WPLS,
            LIMITED_TREASURY,
            MANAGEMENT_WALLET,
            INITIAL_OWNER
        )
    {}
}
