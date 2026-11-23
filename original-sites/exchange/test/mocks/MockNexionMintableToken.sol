// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @dev Local testing helper that mirrors Nexion's single-minter controls.
/// Do not deploy this as a production token.
contract MockNexionMintableToken is ERC20, Ownable {
    address public minter;
    bool public mintingFinalized;
    bool public mintShouldRevert;

    error NotMinter();
    error MintingAlreadyFinalized();
    error ForcedMintFailure();

    constructor(address initialOwner, uint256 initialSupply)
        ERC20("Mock Limited", "MLTD")
        Ownable(initialOwner)
    {
        minter = initialOwner;
        _mint(initialOwner, initialSupply);
    }

    function mint(address recipient, uint256 amount) external {
        if (msg.sender != minter) revert NotMinter();
        if (mintShouldRevert) revert ForcedMintFailure();
        _mint(recipient, amount);
    }

    function setMintShouldRevert(bool shouldRevert) external onlyOwner {
        mintShouldRevert = shouldRevert;
    }

    function setMinter(address newMinter) external onlyOwner {
        if (mintingFinalized) revert MintingAlreadyFinalized();
        minter = newMinter;
    }

    function finalizeMinting() external onlyOwner {
        mintingFinalized = true;
        minter = address(0);
    }
}
