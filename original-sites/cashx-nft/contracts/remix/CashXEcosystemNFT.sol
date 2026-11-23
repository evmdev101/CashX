// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// OpenZeppelin imports are pinned to the version used for testing.
import {ERC721} from "@openzeppelin/contracts@5.0.2/token/ERC721/ERC721.sol";
import {ERC721Enumerable} from "@openzeppelin/contracts@5.0.2/token/ERC721/extensions/ERC721Enumerable.sol";
import {Ownable} from "@openzeppelin/contracts@5.0.2/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts@5.0.2/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts@5.0.2/utils/ReentrancyGuard.sol";

/// @title CashX Ecosystem NFT
/// @notice Fixed-supply ERC-721 collection minted with native PLS on PulseChain.
/// @dev Token IDs are sequential and every token uses the same metadata URI.
contract CashXEcosystemNFT is ERC721, ERC721Enumerable, Ownable2Step, ReentrancyGuard {
    uint256 public constant MAX_SUPPLY = 10_000;
    uint256 public immutable PRICE_PER_NFT;

    address payable public treasury;
    bool public saleActive;
    bool public metadataFrozen;

    string private _sharedTokenURI;

    error DirectPLSDisabled();
    error IncorrectPayment(uint256 expected, uint256 received);
    error InvalidPrice();
    error InvalidQuantity(uint256 requested);
    error MetadataIsFrozen();
    error SaleClosed();
    error SoldOut(uint256 remaining);
    error TreasuryTransferFailed();
    error UnauthorizedTreasuryAcceptance(address caller);
    error ZeroAddress();
    error EmptyTokenURI();

    event MetadataFrozen(string tokenURI);
    event Minted(
        address indexed buyer,
        uint256 indexed firstTokenId,
        uint256 quantity,
        uint256 totalPaid
    );
    event SaleStatusChanged(bool active);
    event SharedTokenURIUpdated(string newTokenURI);
    event TreasuryTransferStarted(address indexed currentTreasury, address indexed pendingTreasury);
    event TreasuryUpdated(address indexed previousTreasury, address indexed newTreasury);

    address payable public pendingTreasury;

    /// @param initialOwner Address responsible for sale and metadata administration.
    /// @param initialTreasury Address that receives mint proceeds.
    /// @param initialTokenURI Shared metadata URI for the collection.
    /// @param initialPricePerNFT Mint price in wei.
    constructor(
        address initialOwner,
        address payable initialTreasury,
        string memory initialTokenURI,
        uint256 initialPricePerNFT
    ) ERC721("CashX Ecosystem", "CASHXNFT") Ownable(initialOwner) {
        if (initialOwner == address(0) || initialTreasury == address(0)) revert ZeroAddress();
        if (bytes(initialTokenURI).length == 0) revert EmptyTokenURI();
        if (initialPricePerNFT == 0) revert InvalidPrice();

        treasury = initialTreasury;
        _sharedTokenURI = initialTokenURI;
        PRICE_PER_NFT = initialPricePerNFT;
    }

    /// @notice Mints NFTs to the caller and forwards the payment to the treasury.
    function mint(uint256 quantity) external payable nonReentrant {
        _purchase(quantity);
    }

    /// @notice Alternate mint entry point retained for frontend compatibility.
    function buyWithPLS(uint256 quantity) external payable nonReentrant {
        _purchase(quantity);
    }

    function _purchase(uint256 quantity) private {
        if (!saleActive) revert SaleClosed();
        if (quantity == 0) revert InvalidQuantity(quantity);

        uint256 minted = totalSupply();
        uint256 remaining = MAX_SUPPLY - minted;
        if (quantity > remaining) revert SoldOut(remaining);

        uint256 requiredPayment = PRICE_PER_NFT * quantity;
        if (msg.value != requiredPayment) {
            revert IncorrectPayment(requiredPayment, msg.value);
        }

        uint256 firstTokenId = minted + 1;
        for (uint256 i; i < quantity; ++i) {
            _safeMint(msg.sender, firstTokenId + i);
        }

        (bool sent, ) = treasury.call{value: msg.value}("");
        if (!sent) revert TreasuryTransferFailed();

        emit Minted(msg.sender, firstTokenId, quantity, msg.value);
    }

    /// @notice Returns the payment required to mint a given quantity.
    function quote(uint256 quantity) external view returns (uint256) {
        return PRICE_PER_NFT * quantity;
    }

    /// @notice Returns the mint price using the legacy frontend getter name.
    function nftPrice() external view returns (uint256) {
        return PRICE_PER_NFT;
    }

    function remainingSupply() external view returns (uint256) {
        return MAX_SUPPLY - totalSupply();
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return _sharedTokenURI;
    }

    function sharedTokenURI() external view returns (string memory) {
        return _sharedTokenURI;
    }

    /// @notice Opens or pauses public minting.
    function setSaleActive(bool active) external onlyOwner {
        saleActive = active;
        emit SaleStatusChanged(active);
    }

    /// @notice Updates the shared metadata URI while metadata remains editable.
    function setSharedTokenURI(string calldata newTokenURI) external onlyOwner {
        if (metadataFrozen) revert MetadataIsFrozen();
        if (bytes(newTokenURI).length == 0) revert EmptyTokenURI();

        _sharedTokenURI = newTokenURI;
        emit SharedTokenURIUpdated(newTokenURI);
    }

    /// @notice Permanently locks the current metadata URI.
    function freezeMetadata() external onlyOwner {
        if (metadataFrozen) revert MetadataIsFrozen();

        metadataFrozen = true;
        emit MetadataFrozen(_sharedTokenURI);
    }

    /// @notice Proposes a new treasury address.
    function startTreasuryTransfer(address payable newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert ZeroAddress();

        pendingTreasury = newTreasury;
        emit TreasuryTransferStarted(treasury, newTreasury);
    }

    /// @notice Completes a treasury change after acceptance by the proposed address.
    function acceptTreasury() external {
        address payable proposedTreasury = pendingTreasury;
        if (msg.sender != proposedTreasury) {
            revert UnauthorizedTreasuryAcceptance(msg.sender);
        }

        address payable previousTreasury = treasury;
        treasury = proposedTreasury;
        pendingTreasury = payable(address(0));
        emit TreasuryUpdated(previousTreasury, proposedTreasury);
    }

    receive() external payable {
        revert DirectPLSDisabled();
    }

    function _update(address to, uint256 tokenId, address auth)
        internal
        override(ERC721, ERC721Enumerable)
        returns (address)
    {
        return super._update(to, tokenId, auth);
    }

    function _increaseBalance(address account, uint128 value)
        internal
        override(ERC721, ERC721Enumerable)
    {
        super._increaseBalance(account, value);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721Enumerable)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
