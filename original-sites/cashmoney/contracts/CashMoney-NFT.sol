// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts@5.0.2/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts@5.0.2/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts@5.0.2/access/Ownable.sol";
import "@openzeppelin/contracts@5.0.2/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts@5.0.2/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts@5.0.2/utils/Strings.sol";

contract CashMoney is ERC721, ERC721Enumerable, Ownable, ReentrancyGuard {
    using Strings for uint256;

    uint256 public constant maxSupply = 369;
    uint256 public constant mintDuration = 14 days + 5 minutes;

    uint256 public constant edaiAmount = 110 ether;
    uint256 public constant plsAmount = 1_500_000 ether;

    IERC20 public constant edai = IERC20(0xefD766cCb38EaF1dfd701853BFCe31359239F305);
    address public constant treasury = 0x1b5E021691BC4121302eEaE6abD3Be08B203c7D6;

    string public constant uriSuffix = ".json";

    uint256 public immutable mintStart;
    uint256 public immutable mintEnd;

    uint256 public totalMinted;
    string public baseURI = "ipfs://bafybeidd7ftycyesgsbmequfwkidbq662edinpa37sk5qsfbyebyiub54a/";

    event Minted(address indexed buyer, uint256 quantity, uint256 firstTokenId);

    constructor() ERC721("CashMoney", "CASH") Ownable(msg.sender) {
        mintStart = block.timestamp;
        mintEnd = block.timestamp + mintDuration;
    }

    function mint(uint256 quantity) external payable nonReentrant {
        require(quantity > 0, "must mint at least 1");
        require(block.timestamp >= mintStart, "mint not started");
        require(block.timestamp < mintEnd, "mint ended");
        require(totalMinted + quantity <= maxSupply, "sold out");

        uint256 totalEdai = edaiAmount * quantity;
        uint256 totalPls = plsAmount * quantity;

        require(msg.value == totalPls, "wrong PLS amount");
        require(edai.transferFrom(msg.sender, treasury, totalEdai), "eDAI transfer failed");

        (bool sent, ) = treasury.call{value: msg.value}("");
        require(sent, "PLS transfer failed");

        uint256 firstTokenId = totalMinted + 1;
        for (uint256 i = 0; i < quantity; i++) {
            _safeMint(msg.sender, ++totalMinted);
        }

        emit Minted(msg.sender, quantity, firstTokenId);
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(_ownerOf(tokenId) != address(0), "token does not exist");
        return string(abi.encodePacked(baseURI, tokenId.toString(), uriSuffix));
    }

    function setBaseURI(string calldata uri) external onlyOwner {
        baseURI = uri;
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
