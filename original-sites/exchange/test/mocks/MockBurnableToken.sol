// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev Local testing helper that mimics the originals' dead-address burn path.
/// Do not deploy this as a production token.
contract MockBurnableToken is ERC20 {
    address public constant BURN_SINK = 0x000000000000000000000000000000000000dEaD;
    address public immutable reflectionSource;
    address public reflectionRouter;
    uint256 public reflectionDust;

    constructor(string memory name_, string memory symbol_, address recipient, uint256 supply)
        ERC20(name_, symbol_)
    {
        reflectionSource = recipient;
        _mint(recipient, supply);
    }

    function configureRouterReflection(address router, uint256 dust) external {
        require(msg.sender == reflectionSource, "not reflection source");
        reflectionRouter = router;
        reflectionDust = dust;
    }

    function transferFrom(address from, address to, uint256 value)
        public
        override
        returns (bool)
    {
        bool transferred = super.transferFrom(from, to, value);
        if (msg.sender == reflectionRouter && reflectionDust != 0) {
            _transfer(reflectionSource, from, reflectionDust);
        }
        return transferred;
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to == BURN_SINK) {
            super._update(from, address(0), value);
            return;
        }

        super._update(from, to, value);
    }
}
