// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @dev Functions used from a mintable Nexion token.
interface INexionLimitedMintable is IERC20Metadata {
    function minter() external view returns (address);
    function mint(address recipient, uint256 amount) external;
}

/// @dev PulseX V2 uses ETH-style function names for native PLS swaps.
interface IPulseXRouterV2 {
    function WPLS() external view returns (address);

    function getAmountsOut(uint256 amountIn, address[] calldata path)
        external
        view
        returns (uint256[] memory amounts);

    function swapExactTokensForETHSupportingFeeOnTransferTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external;
}

/// @title SwapBurnMintExchangeCore
/// @notice Exchanges an original token for its matching Limited token.
/// @dev Each exchange burns 80% of the original token, swaps 20% to PLS for
/// the treasury, mints 1:1 to the user, and mints an extra 5% to management.
/// The two tokens must use the same decimals, and this contract must be the
/// Limited token's active minter.
abstract contract SwapBurnMintExchangeCore is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public constant BURN_SINK = 0x000000000000000000000000000000000000dEaD;
    uint256 public constant BPS_DENOMINATOR = 10_000;
    uint256 public constant BURN_BPS = 8_000;
    uint256 public constant SWAP_BPS = 2_000;
    uint256 public constant MANAGEMENT_MINT_BPS = 500;

    IERC20 public immutable burnToken;
    INexionLimitedMintable public immutable limitedToken;
    IPulseXRouterV2 public immutable pulseXRouter;
    address public immutable wrappedPls;
    address public immutable treasury;
    address public immutable managementWallet;
    uint256 public immutable limitedSupplyAtDeployment;

    uint256 public totalOriginalProcessed;
    uint256 public totalBurned;
    uint256 public totalOriginalSwapped;
    uint256 public totalPlsToTreasury;
    uint256 public totalLimitedMintedToUsers;
    uint256 public totalLimitedMintedToManagement;
    uint256 public exchangeCount;

    mapping(address account => uint256 amount) public accountOriginalProcessed;

    error ZeroAddress();
    error ZeroAmount();
    error ZeroMinimumOutput();
    error AmountTooSmall();
    error DecimalMismatch(uint8 burnDecimals, uint8 limitedDecimals);
    error InvalidRouterWrappedPls(address expected, address actual);
    error ExchangeIsNotMinter(address currentMinter);
    error InvalidSupplyChange(uint256 beforeSupply, uint256 afterSupply);
    error ExactBurnRequired(uint256 expected, uint256 burned);
    error ExactOriginalRequired(uint256 expected, uint256 received);
    error RouterDidNotUseFullAllowance(uint256 remainingAllowance);
    error PlsTreasuryShortfall(uint256 minimum, uint256 received);
    error ExactMintRequired(uint256 expected, uint256 received);
    error ExactMintSupplyRequired(uint256 expected, uint256 minted);

    event BurnedSwappedAndMinted(
        address indexed account,
        uint256 originalAmount,
        uint256 burnedAmount,
        uint256 originalSwappedAmount,
        uint256 plsTreasuryAmount,
        uint256 userLimitedAmount,
        uint256 managementLimitedAmount,
        uint256 indexed exchangeNumber
    );

    constructor(
        address burnToken_,
        address limitedToken_,
        address pulseXRouter_,
        address wrappedPls_,
        address treasury_,
        address managementWallet_,
        address initialOwner
    ) Ownable(initialOwner) {
        if (
            burnToken_ == address(0) || limitedToken_ == address(0)
                || pulseXRouter_ == address(0) || wrappedPls_ == address(0)
                || treasury_ == address(0) || managementWallet_ == address(0)
                || initialOwner == address(0)
        ) {
            revert ZeroAddress();
        }

        uint8 burnDecimals = IERC20Metadata(burnToken_).decimals();
        uint8 limitedDecimals = IERC20Metadata(limitedToken_).decimals();
        if (burnDecimals != limitedDecimals) {
            revert DecimalMismatch(burnDecimals, limitedDecimals);
        }

        address routerWrappedPls = IPulseXRouterV2(pulseXRouter_).WPLS();
        if (routerWrappedPls != wrappedPls_) {
            revert InvalidRouterWrappedPls(wrappedPls_, routerWrappedPls);
        }

        burnToken = IERC20(burnToken_);
        limitedToken = INexionLimitedMintable(limitedToken_);
        pulseXRouter = IPulseXRouterV2(pulseXRouter_);
        wrappedPls = wrappedPls_;
        treasury = treasury_;
        managementWallet = managementWallet_;
        limitedSupplyAtDeployment = IERC20(limitedToken_).totalSupply();
    }

    /// @notice Calculates the burn, swap, user mint, and management mint amounts.
    function quote(uint256 amount)
        public
        pure
        returns (
            uint256 burnAmount,
            uint256 swapAmount,
            uint256 userLimitedAmount,
            uint256 managementLimitedAmount
        )
    {
        burnAmount = amount * BURN_BPS / BPS_DENOMINATOR;
        swapAmount = amount - burnAmount;
        userLimitedAmount = amount;
        managementLimitedAmount = amount * MANAGEMENT_MINT_BPS / BPS_DENOMINATOR;
    }

    /// @notice Gets the current PulseX quote for the 20% swap portion.
    /// @dev The caller should apply slippage before using this as minPlsOut.
    function quotePlsOut(uint256 amount) external view returns (uint256 expectedPlsOut) {
        (, uint256 swapAmount,,) = quote(amount);
        if (swapAmount == 0) revert AmountTooSmall();

        address[] memory path = _swapPath();
        uint256[] memory amounts = pulseXRouter.getAmountsOut(swapAmount, path);
        expectedPlsOut = amounts[amounts.length - 1];
    }

    /// @notice Burns, swaps, and mints in one transaction.
    /// @param amount Amount of the original token to exchange.
    /// @param minPlsOut Minimum PLS the treasury must receive from PulseX.
    function burnAndMint(uint256 amount, uint256 minPlsOut)
        external
        nonReentrant
        whenNotPaused
    {
        if (amount == 0) revert ZeroAmount();
        if (minPlsOut == 0) revert ZeroMinimumOutput();

        (
            uint256 burnAmount,
            uint256 swapAmount,
            uint256 userLimitedAmount,
            uint256 managementLimitedAmount
        ) = quote(amount);
        if (burnAmount == 0 || swapAmount == 0 || managementLimitedAmount == 0) {
            revert AmountTooSmall();
        }

        address currentMinter = limitedToken.minter();
        if (currentMinter != address(this)) revert ExchangeIsNotMinter(currentMinter);

        _burnOriginal(msg.sender, burnAmount);
        uint256 plsTreasuryAmount = _swapOriginalForPls(msg.sender, swapAmount, minPlsOut);
        _mintLimitedExact(msg.sender, userLimitedAmount);
        _mintLimitedExact(managementWallet, managementLimitedAmount);

        totalOriginalProcessed += amount;
        totalBurned += burnAmount;
        totalOriginalSwapped += swapAmount;
        totalPlsToTreasury += plsTreasuryAmount;
        totalLimitedMintedToUsers += userLimitedAmount;
        totalLimitedMintedToManagement += managementLimitedAmount;
        exchangeCount += 1;
        accountOriginalProcessed[msg.sender] += amount;

        emit BurnedSwappedAndMinted(
            msg.sender,
            amount,
            burnAmount,
            swapAmount,
            plsTreasuryAmount,
            userLimitedAmount,
            managementLimitedAmount,
            exchangeCount
        );
    }

    function _burnOriginal(address account, uint256 amount) internal {
        uint256 supplyBefore = burnToken.totalSupply();
        burnToken.safeTransferFrom(account, BURN_SINK, amount);
        uint256 supplyAfter = burnToken.totalSupply();

        if (supplyAfter > supplyBefore) {
            revert InvalidSupplyChange(supplyBefore, supplyAfter);
        }

        uint256 burned = supplyBefore - supplyAfter;
        if (burned != amount) revert ExactBurnRequired(amount, burned);
    }

    function _swapOriginalForPls(address account, uint256 amount, uint256 minPlsOut)
        internal
        returns (uint256 plsReceived)
    {
        uint256 exchangeBalanceBefore = burnToken.balanceOf(address(this));
        burnToken.safeTransferFrom(account, address(this), amount);
        uint256 exchangeBalanceAfter = burnToken.balanceOf(address(this));
        uint256 received = exchangeBalanceAfter - exchangeBalanceBefore;
        // KNOWN ISSUE - left as-is because this contract is already deployed.
        // The reflection originals recompute balanceOf against a rate that moves on
        // every transfer, so this balance can come back a few thousand wei above
        // `amount` and the exact match below rejects an otherwise valid exchange.
        // Seen intermittently on DivX and GSX. The fix is `received < amount`, which
        // is safe because the swap only ever approves and sells exactly `amount` -
        // but it needs a redeploy plus a minter rotation, so it is not applied here.
        // Until then the website dry-runs each trade and offers a retry, so hitting
        // this costs the user nothing.
        if (received != amount) revert ExactOriginalRequired(amount, received);

        burnToken.forceApprove(address(pulseXRouter), amount);
        uint256 treasuryBalanceBefore = treasury.balance;

        address[] memory path = _swapPath();
        pulseXRouter.swapExactTokensForETHSupportingFeeOnTransferTokens(
            amount,
            minPlsOut,
            path,
            treasury,
            block.timestamp
        );

        // Nexion tokens can credit a very small reflection back to this contract
        // while the router is swapping. Checking the remaining allowance proves
        // the router pulled the full swap amount without rejecting that dust.
        uint256 remainingAllowance = burnToken.allowance(address(this), address(pulseXRouter));
        if (remainingAllowance != 0) {
            revert RouterDidNotUseFullAllowance(remainingAllowance);
        }
        burnToken.forceApprove(address(pulseXRouter), 0);

        uint256 treasuryBalanceAfter = treasury.balance;
        plsReceived =
            treasuryBalanceAfter >= treasuryBalanceBefore
                ? treasuryBalanceAfter - treasuryBalanceBefore
                : 0;
        if (plsReceived < minPlsOut) revert PlsTreasuryShortfall(minPlsOut, plsReceived);
    }

    function _mintLimitedExact(address recipient, uint256 amount) internal {
        uint256 balanceBefore = limitedToken.balanceOf(recipient);
        uint256 supplyBefore = limitedToken.totalSupply();

        limitedToken.mint(recipient, amount);

        uint256 received = limitedToken.balanceOf(recipient) - balanceBefore;
        if (received != amount) revert ExactMintRequired(amount, received);

        uint256 minted = limitedToken.totalSupply() - supplyBefore;
        if (minted != amount) revert ExactMintSupplyRequired(amount, minted);
    }

    function _swapPath() internal view returns (address[] memory path) {
        path = new address[](2);
        path[0] = address(burnToken);
        path[1] = wrappedPls;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
