import { MAX_MINT_PER_TX, EDAI_SYMBOL, PLS_SYMBOL, GSX_SAC } from '../config'

const FAQS = [
  {
    q: 'What is CashMoney NFT?',
    a: `A 369-piece collection on PulseChain: seven squads — Apes, Pigs, Bulls, Tinmen, Punks, Frogs and Dogs — plus 19 wildcard pieces scattered through the deck. Which piece you get is decided by mint order, and the artwork is stored permanently on IPFS.`,
  },
  {
    q: 'How much does a mint cost?',
    a: `The mainnet launch price is 110 ${EDAI_SYMBOL} plus 1,500,000 PLS per NFT. The mint panel still reads the exact live values directly from the deployed contract, so it cannot display a stale price.`,
  },
  {
    q: 'When does the mint open and close?',
    a: 'The mint opens as soon as the mainnet contract is deployed and runs for 14 days plus 5 minutes. The countdown is read from the contract’s on-chain start and end timestamps.',
  },
  {
    q: 'Why are there two steps (Approve, then Mint)?',
    a: `${EDAI_SYMBOL} is a token, and tokens require a one-time "approve" so the mint contract may take the payment — that's standard and safe. The ${PLS_SYMBOL} part travels along with the mint transaction itself. The buttons walk you through both steps in order.`,
  },
  {
    q: 'How many can I mint at once?',
    a: `You may choose any quantity up to the ${MAX_MINT_PER_TX} NFTs remaining in the collection in a single transaction. The contract caps only the total collection at 369; very large mints may require more wallet gas than a smaller batch.`,
  },
  {
    q: 'What happens if a very large batch is minted?',
    a: `The wallet and contract determine whether the transaction is allowed. To keep browsers responsive, the reveal animation previews up to 10 cards and summarizes any additional NFTs; every successfully minted NFT still appears in Items and the owner's wallet.`,
  },
  {
    q: 'What is the GSX SAC?',
    a: `GSX SAC is a separate, optional PulseChain program shown in the GSX SAC tab. The posted rate is ${GSX_SAC.PLS_PER_GSX} PLS per 1 GSX, and the listed SAC address is ${GSX_SAC.ADDRESS}. Send native PLS only and verify the address before every transfer.`,
  },
  {
    q: 'Is GSX SAC required to mint a CashMoney NFT?',
    a: `No. The NFT mint and GSX SAC are separate. CashMoney NFTs are purchased only through the Mint tab using the eDAI and PLS amounts read directly from the deployed NFT contract. The GSX SAC tab never initiates a transfer.`,
  },
  {
    q: 'What wallet and network do I need?',
    a: `For the public launch, use MetaMask or Rabby on PulseChain mainnet. If your wallet is on the wrong network, the site offers to switch or add it with one click.`,
  },
  {
    q: 'Where does the artwork live?',
    a: `The artwork metadata is permanently stored on IPFS and is already built into the mainnet contract. Each token resolves to its own numbered metadata file, so the art does not depend on this website existing.`,
  },
  {
    q: 'What happens after I mint?',
    a: `Your NFTs appear in the Items tab and in your wallet. Nexion staking and any GSX allocation linked to NFT purchases will be documented only after the final contracts, distribution timing, and launch terms are confirmed. Until then, staking remains disabled and no placeholder approval or transfer can be sent.`,
  },
]

export default function Faq() {
  return (
    <section className="mx-auto max-w-2xl py-14">
      <h2 className="font-cashx-display text-center text-3xl font-extrabold uppercase tracking-wide">FAQ</h2>
      <div className="mt-6 space-y-2">
        {FAQS.map(({ q, a }) => (
          <details key={q} className="panel group px-5 py-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-bold [&::-webkit-details-marker]:hidden">
              {q}
              <span className="accent shrink-0 transition-transform duration-200 group-open:rotate-45">+</span>
            </summary>
            <p className="muted mt-3 text-sm leading-6">{a}</p>
          </details>
        ))}
      </div>
    </section>
  )
}
