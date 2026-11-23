// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SwapBurnMintExchangeCore} from "./SwapBurnMintExchangeCore.sol";

/// @title DivXLDivXMintExchange
/// @notice DivX to LDivX burn-and-mint exchange.
contract DivXLDivXMintExchange is SwapBurnMintExchangeCore {
    address public constant DIVX = 0x6df9CD07BF067b42A700dc679bD9325Ff61Da8f3;
    address public constant LDIVX = 0x8DbD0923c0c2dd4973806B655036251610aE11BC;
    address public constant PULSEX_V2_ROUTER = 0x165C3410fC91EF562C50559f7d2289fEbed552d9;
    address public constant WPLS = 0xA1077a294dDE1B09bB078844df40758a5D0f9a27;
    address public constant LIMITED_TREASURY = 0x175750eA3aDed69d2375ffe044BFb6E46ec90702;
    address public constant MANAGEMENT_WALLET = 0xDBA19652f7Ed3f3AE6266c91669C6083ba8cE557;
    address public constant INITIAL_OWNER = 0x175750eA3aDed69d2375ffe044BFb6E46ec90702;

    constructor()
        SwapBurnMintExchangeCore(
            DIVX,
            LDIVX,
            PULSEX_V2_ROUTER,
            WPLS,
            LIMITED_TREASURY,
            MANAGEMENT_WALLET,
            INITIAL_OWNER
        )
    {}
}
