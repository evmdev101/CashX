// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SwapBurnMintExchangeCore} from "../contracts/src/SwapBurnMintExchangeCore.sol";
import {MockBurnableToken} from "./mocks/MockBurnableToken.sol";
import {MockNexionMintableToken} from "./mocks/MockNexionMintableToken.sol";

interface Vm {
    function deal(address account, uint256 newBalance) external;
}

contract MockPulseXRouterV2 {
    address public immutable WPLS;
    uint256 public constant OUTPUT_MULTIPLIER = 6;

    constructor(address wrappedPls_) {
        WPLS = wrappedPls_;
    }

    receive() external payable {}

    function getAmountsOut(uint256 amountIn, address[] calldata path)
        external
        pure
        returns (uint256[] memory amounts)
    {
        require(path.length == 2, "bad path");
        amounts = new uint256[](2);
        amounts[0] = amountIn;
        amounts[1] = amountIn * OUTPUT_MULTIPLIER;
    }

    function swapExactTokensForETHSupportingFeeOnTransferTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256
    ) external {
        require(path.length == 2 && path[1] == WPLS, "bad path");
        IERC20(path[0]).transferFrom(msg.sender, address(this), amountIn);

        uint256 amountOut = amountIn * OUTPUT_MULTIPLIER;
        require(amountOut >= amountOutMin, "INSUFFICIENT_OUTPUT_AMOUNT");
        (bool sent,) = payable(to).call{value: amountOut}("");
        require(sent, "PLS transfer failed");
    }
}

contract TestSwapBurnMintExchange is SwapBurnMintExchangeCore {
    constructor(
        address burnToken_,
        address limitedToken_,
        address router_,
        address wrappedPls_,
        address treasury_,
        address managementWallet_,
        address owner_
    )
        SwapBurnMintExchangeCore(
            burnToken_,
            limitedToken_,
            router_,
            wrappedPls_,
            treasury_,
            managementWallet_,
            owner_
        )
    {}
}

contract SwapMintActor {
    function approve(IERC20 token, address spender, uint256 amount) external {
        token.approve(spender, amount);
    }

    function burnAndMint(
        SwapBurnMintExchangeCore exchange,
        uint256 amount,
        uint256 minPlsOut
    ) external {
        exchange.burnAndMint(amount, minPlsOut);
    }

    function tryBurnAndMint(
        SwapBurnMintExchangeCore exchange,
        uint256 amount,
        uint256 minPlsOut
    ) external returns (bool) {
        try exchange.burnAndMint(amount, minPlsOut) {
            return true;
        } catch {
            return false;
        }
    }

    function tryPause(SwapBurnMintExchangeCore exchange) external returns (bool) {
        try exchange.pause() {
            return true;
        } catch {
            return false;
        }
    }
}

contract SwapBurnMintExchangeTest {
    Vm private constant vm =
        Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    uint256 private constant ONE = 1 ether;
    uint256 private constant ORIGINAL_SUPPLY = 1_000_000 * ONE;
    address private constant WPLS = address(0xA107);
    address private constant TREASURY = address(0xBEEF);
    address private constant MANAGEMENT = address(0xCAFE);

    MockBurnableToken private originalToken;
    MockNexionMintableToken private limitedToken;
    MockPulseXRouterV2 private router;
    TestSwapBurnMintExchange private exchange;
    SwapMintActor private alice;

    function setUp() public {
        originalToken = new MockBurnableToken("Original", "ORG", address(this), ORIGINAL_SUPPLY);
        // Nexion requires the token to begin with one token. The exchange only
        // counts supply minted after it is deployed.
        limitedToken = new MockNexionMintableToken(address(this), ONE);
        router = new MockPulseXRouterV2(WPLS);
        exchange = new TestSwapBurnMintExchange(
            address(originalToken),
            address(limitedToken),
            address(router),
            WPLS,
            TREASURY,
            MANAGEMENT,
            address(this)
        );
        alice = new SwapMintActor();

        vm.deal(address(router), 10_000_000 * ONE);
        originalToken.transfer(address(alice), 10_000 * ONE);
        alice.approve(originalToken, address(exchange), type(uint256).max);
        limitedToken.setMinter(address(exchange));
    }

    function testStartingSupplyDoesNotAffectExchangeAccounting() public view {
        require(limitedToken.totalSupply() == ONE, "limited token must start with one token");
        require(exchange.limitedSupplyAtDeployment() == ONE, "starting supply not recorded");
        require(exchange.totalLimitedMintedToUsers() == 0, "starting supply counted as user mint");
        require(
            exchange.totalLimitedMintedToManagement() == 0,
            "starting supply counted as management mint"
        );
    }

    function testQuoteIsEightyTwentyOneToOnePlusFivePercent() public view {
        (
            uint256 burnAmount,
            uint256 swapAmount,
            uint256 userAmount,
            uint256 managementAmount
        ) = exchange.quote(100 * ONE);

        require(burnAmount == 80 * ONE, "wrong burn quote");
        require(swapAmount == 20 * ONE, "wrong swap quote");
        require(userAmount == 100 * ONE, "user output is not 1:1");
        require(managementAmount == 5 * ONE, "management output is not 5%");
        require(exchange.quotePlsOut(100 * ONE) == 120 * ONE, "wrong router quote");
    }

    function testCompleteAtomicFlow() public {
        uint256 amount = 100 * ONE;
        uint256 originalSupplyBefore = originalToken.totalSupply();
        uint256 limitedSupplyBefore = limitedToken.totalSupply();
        uint256 treasuryPlsBefore = TREASURY.balance;

        alice.burnAndMint(exchange, amount, 110 * ONE);

        require(originalToken.totalSupply() == originalSupplyBefore - 80 * ONE, "wrong burn");
        require(originalToken.balanceOf(address(router)) == 20 * ONE, "20% was not swapped");
        require(TREASURY.balance - treasuryPlsBefore == 120 * ONE, "wrong PLS treasury output");
        require(limitedToken.balanceOf(address(alice)) == 100 * ONE, "user did not receive 1:1 output");
        require(limitedToken.balanceOf(MANAGEMENT) == 5 * ONE, "management did not receive extra 5%");
        require(
            limitedToken.totalSupply() == limitedSupplyBefore + 105 * ONE,
            "limited supply did not increase by user plus management mints"
        );
        require(exchange.totalOriginalProcessed() == amount, "wrong processed statistic");
        require(exchange.totalBurned() == 80 * ONE, "wrong burn statistic");
        require(exchange.totalOriginalSwapped() == 20 * ONE, "wrong swapped statistic");
        require(exchange.totalPlsToTreasury() == 120 * ONE, "wrong PLS statistic");
        require(exchange.totalLimitedMintedToUsers() == 100 * ONE, "wrong user mint statistic");
        require(
            exchange.totalLimitedMintedToManagement() == 5 * ONE,
            "wrong management mint statistic"
        );
        require(exchange.exchangeCount() == 1, "wrong exchange count");
    }

    function testRouterReflectionDustDoesNotBlockExchange() public {
        uint256 amount = 100 * ONE;
        uint256 reflectionDust = 142_232;
        uint256 exchangeBalanceBefore = originalToken.balanceOf(address(exchange));

        originalToken.configureRouterReflection(address(router), reflectionDust);
        alice.burnAndMint(exchange, amount, 110 * ONE);

        require(
            originalToken.balanceOf(address(exchange)) == exchangeBalanceBefore + reflectionDust,
            "reflection dust was not credited"
        );
        require(limitedToken.balanceOf(address(alice)) == amount, "reflection token user mint failed");
        require(limitedToken.balanceOf(MANAGEMENT) == 5 * ONE, "reflection token management mint failed");
        require(exchange.totalBurned() == 80 * ONE, "reflection token burn statistic is wrong");
        require(exchange.totalOriginalSwapped() == 20 * ONE, "reflection token swap statistic is wrong");
        require(exchange.exchangeCount() == 1, "reflection token exchange was not counted");
    }

    function testManyWalletsCanExchangeAndAccountingStaysExact() public {
        uint256 walletCount = 25;
        uint256 totalAmount;
        uint256 treasuryPlsBefore = TREASURY.balance;

        for (uint256 i = 1; i <= walletCount; i++) {
            SwapMintActor user = new SwapMintActor();
            uint256 amount = i * ONE;
            (, uint256 swapAmount,,) = exchange.quote(amount);

            originalToken.transfer(address(user), amount);
            user.approve(originalToken, address(exchange), amount);
            user.burnAndMint(exchange, amount, swapAmount * router.OUTPUT_MULTIPLIER());

            require(limitedToken.balanceOf(address(user)) == amount, "wallet received wrong mint");
            require(
                exchange.accountOriginalProcessed(address(user)) == amount,
                "wallet accounting is wrong"
            );
            totalAmount += amount;
        }

        uint256 expectedBurned = totalAmount * 80 / 100;
        uint256 expectedSwapped = totalAmount - expectedBurned;
        uint256 expectedManagementMint = totalAmount * 5 / 100;
        uint256 expectedPls = expectedSwapped * router.OUTPUT_MULTIPLIER();

        require(exchange.exchangeCount() == walletCount, "wrong multi-wallet exchange count");
        require(exchange.totalOriginalProcessed() == totalAmount, "wrong multi-wallet input total");
        require(exchange.totalBurned() == expectedBurned, "wrong multi-wallet burn total");
        require(
            exchange.totalOriginalSwapped() == expectedSwapped,
            "wrong multi-wallet swap total"
        );
        require(
            exchange.totalLimitedMintedToUsers() == totalAmount,
            "wrong multi-wallet user mint total"
        );
        require(
            exchange.totalLimitedMintedToManagement() == expectedManagementMint,
            "wrong multi-wallet management mint total"
        );
        require(
            limitedToken.balanceOf(MANAGEMENT) == expectedManagementMint,
            "management balance is wrong"
        );
        require(
            TREASURY.balance - treasuryPlsBefore == expectedPls,
            "wrong multi-wallet treasury total"
        );
        require(exchange.totalPlsToTreasury() == expectedPls, "wrong multi-wallet PLS total");
    }

    function testExcessiveMinimumOutputRevertsEverything() public {
        uint256 aliceOriginalBefore = originalToken.balanceOf(address(alice));
        uint256 originalSupplyBefore = originalToken.totalSupply();
        uint256 limitedSupplyBefore = limitedToken.totalSupply();
        uint256 treasuryPlsBefore = TREASURY.balance;

        bool succeeded = alice.tryBurnAndMint(exchange, 100 * ONE, 121 * ONE);

        require(!succeeded, "excessive minimum unexpectedly succeeded");
        require(originalToken.balanceOf(address(alice)) == aliceOriginalBefore, "failed swap took input");
        require(originalToken.totalSupply() == originalSupplyBefore, "failed swap burned input");
        require(limitedToken.totalSupply() == limitedSupplyBefore, "failed swap minted output");
        require(TREASURY.balance == treasuryPlsBefore, "failed swap sent PLS");
        require(exchange.exchangeCount() == 0, "failed swap changed statistics");
    }

    function testMintFailureRollsBackBurnSwapAndPlsTransfer() public {
        limitedToken.setMintShouldRevert(true);
        uint256 aliceOriginalBefore = originalToken.balanceOf(address(alice));
        uint256 originalSupplyBefore = originalToken.totalSupply();
        uint256 treasuryPlsBefore = TREASURY.balance;
        uint256 routerOriginalBefore = originalToken.balanceOf(address(router));

        bool succeeded = alice.tryBurnAndMint(exchange, 100 * ONE, 110 * ONE);

        require(!succeeded, "forced mint failure unexpectedly succeeded");
        require(originalToken.balanceOf(address(alice)) == aliceOriginalBefore, "mint failure took input");
        require(originalToken.totalSupply() == originalSupplyBefore, "mint failure burned input");
        require(originalToken.balanceOf(address(router)) == routerOriginalBefore, "mint failure left swap");
        require(TREASURY.balance == treasuryPlsBefore, "mint failure sent PLS");
        require(limitedToken.balanceOf(address(alice)) == 0, "mint failure left user output");
        require(limitedToken.balanceOf(MANAGEMENT) == 0, "mint failure left management output");
        require(exchange.exchangeCount() == 0, "mint failure changed statistics");
    }

    function testWrongMinterRollsBackEverything() public {
        limitedToken.setMinter(address(this));
        uint256 aliceOriginalBefore = originalToken.balanceOf(address(alice));
        uint256 originalSupplyBefore = originalToken.totalSupply();

        bool succeeded = alice.tryBurnAndMint(exchange, 100 * ONE, 110 * ONE);

        require(!succeeded, "exchange worked without minter role");
        require(originalToken.balanceOf(address(alice)) == aliceOriginalBefore, "wrong minter took input");
        require(originalToken.totalSupply() == originalSupplyBefore, "wrong minter burned input");
        require(exchange.exchangeCount() == 0, "wrong minter changed statistics");
    }

    function testOwnerCanPauseAndUnpause() public {
        exchange.pause();
        require(exchange.paused(), "exchange was not paused");

        uint256 aliceOriginalBefore = originalToken.balanceOf(address(alice));
        uint256 originalSupplyBefore = originalToken.totalSupply();
        bool succeededWhilePaused = alice.tryBurnAndMint(exchange, 100 * ONE, 110 * ONE);

        require(!succeededWhilePaused, "paused exchange accepted a transaction");
        require(originalToken.balanceOf(address(alice)) == aliceOriginalBefore, "paused call took input");
        require(originalToken.totalSupply() == originalSupplyBefore, "paused call burned input");
        require(exchange.exchangeCount() == 0, "paused call changed statistics");

        exchange.unpause();
        require(!exchange.paused(), "exchange was not unpaused");
        alice.burnAndMint(exchange, 100 * ONE, 110 * ONE);
        require(exchange.exchangeCount() == 1, "unpaused exchange did not work");
    }

    function testNonOwnerCannotPause() public {
        bool succeeded = alice.tryPause(exchange);
        require(!succeeded, "non-owner paused the exchange");
        require(!exchange.paused(), "exchange became paused");
    }

    function testZeroMinimumOutputRevertsEverything() public {
        uint256 aliceOriginalBefore = originalToken.balanceOf(address(alice));
        uint256 originalSupplyBefore = originalToken.totalSupply();

        bool succeeded = alice.tryBurnAndMint(exchange, 100 * ONE, 0);

        require(!succeeded, "zero minimum output unexpectedly succeeded");
        require(originalToken.balanceOf(address(alice)) == aliceOriginalBefore, "failed call took input");
        require(originalToken.totalSupply() == originalSupplyBefore, "failed call burned input");
        require(exchange.exchangeCount() == 0, "failed call changed statistics");
    }

    function testAmountTooSmallForManagementMintRevertsEverything() public {
        uint256 tinyAmount = 19;
        originalToken.transfer(address(alice), tinyAmount);
        uint256 aliceOriginalBefore = originalToken.balanceOf(address(alice));
        uint256 originalSupplyBefore = originalToken.totalSupply();

        bool succeeded = alice.tryBurnAndMint(exchange, tinyAmount, 1);

        require(!succeeded, "amount with zero management mint unexpectedly succeeded");
        require(originalToken.balanceOf(address(alice)) == aliceOriginalBefore, "failed call took input");
        require(originalToken.totalSupply() == originalSupplyBefore, "failed call burned input");
        require(exchange.exchangeCount() == 0, "failed call changed statistics");
    }
}
