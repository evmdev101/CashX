// CashMoney NFT contract ABI (ethers v6 human-readable format).
// Full surface of the deployed contract so later sessions
// (gallery, staking, countdown) can reuse this file.

export const CASHMONEY_ABI = [
  // ── Events ────────────────────────────────────────────────
  'event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId)',
  'event ApprovalForAll(address indexed owner, address indexed operator, bool approved)',
  'event Minted(address indexed buyer, uint256 quantity, uint256 firstTokenId)',
  'event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)',
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',

  // ── Mint ──────────────────────────────────────────────────
  'function mint(uint256 quantity) payable',

  // ── Mint info (view) ──────────────────────────────────────
  'function totalMinted() view returns (uint256)',
  'function maxSupply() view returns (uint256)',
  'function plsAmount() view returns (uint256)',
  'function edaiAmount() view returns (uint256)',
  'function edai() view returns (address)',
  'function mintStart() view returns (uint256)',
  'function mintEnd() view returns (uint256)',
  'function treasury() view returns (address)',

  // ── ERC721 standard ───────────────────────────────────────
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function balanceOf(address owner) view returns (uint256)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function tokenURI(uint256 tokenId) view returns (string)',
  'function totalSupply() view returns (uint256)',
  'function tokenByIndex(uint256 index) view returns (uint256)',
  'function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)',
  'function getApproved(uint256 tokenId) view returns (address)',
  'function isApprovedForAll(address owner, address operator) view returns (bool)',
  'function supportsInterface(bytes4 interfaceId) view returns (bool)',
  'function approve(address to, uint256 tokenId)',
  'function setApprovalForAll(address operator, bool approved)',
  'function transferFrom(address from, address to, uint256 tokenId)',
  'function safeTransferFrom(address from, address to, uint256 tokenId)',
  'function safeTransferFrom(address from, address to, uint256 tokenId, bytes data)',

  // ── Metadata / admin (owner only) ─────────────────────────
  'function baseURI() view returns (string)',
  'function uriSuffix() view returns (string)',
  'function owner() view returns (address)',
  'function setBaseURI(string _uri)',
  'function setUriSuffix(string _suffix)',
  'function setEdaiAddress(address _edai)',
  'function setEdaiAmount(uint256 _amount)',
  'function setPlsAmount(uint256 _amount)',
  'function setMintWindow(uint256 _start, uint256 _end)',
  'function setTreasury(address _treasury)',
  'function transferOwnership(address newOwner)',
  'function renounceOwnership()',
]
