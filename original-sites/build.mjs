// Build the original apps, changing only their site integration, not their layouts.
import {build} from 'vite';
import react from '@vitejs/plugin-react';
import tailwind4 from '@tailwindcss/postcss';
import tailwind3 from 'tailwindcss3';
import autoprefixer from 'autoprefixer';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const sharedEffect=`
  useEffect(() => {
    if (!window.cashxHost) return;
    return window.cashxHost.subscribe(async () => {
      const address = window.cashxHost.address();
      HOST_UPDATE
    });
  }, []);
`;
function replace(source,from,to){if(!source.includes(from))throw Error('Original source changed: '+from.slice(0,70));return source.replace(from,to);}
for(const slug of ['exchange','cashx-nft','cashmoney']){
  const root=path.join(here,slug);
  await build({root,configFile:false,base:'./',plugins:[react(),{
    name:'cashx-host-integration',enforce:'pre',
    transformIndexHtml(html){return html.replace('<head>','<head><script src="../../lib/original-site-bridge.js?v=20261109-neutral"></script>');},
    transform(source,id){
      if(id.includes('/node_modules/'))return;
      source=source.replace(/\r\n/g,'\n');
      if(slug==='exchange'&&id.endsWith('/app/page.tsx')){
        // The host already has its own Farms page and main navigation.
        source=replace(source,'import LimitedFarms from "./LimitedFarms";','');
        source=source.replace(/  const \[activeView, setActiveView\] = useState<SiteView>\(\(\) => \{[\s\S]*?\n  \}\);\n/,'');
        source=source.replace(/  useEffect\(\(\) => \{\n    const syncViewFromHash = [\s\S]*?\n  \}, \[\]\);\n/,'');
        source=source.replace(/      <header className="topbar">[\s\S]*?<\/header>/,'');
        source=replace(source,'{activeView === "exchange" ? (','');
        source=source.replace(/\n      \) : \(\n        <LimitedFarms[\s\S]*?\n      \)\}/,'');
        source=replace(source,'<p className="status-line" role="status">{status}</p>','{!/^(?:Approve .* in your wallet|Confirm .* in your wallet|Approval submitted|Approval confirmed|Trade submitted|Trade confirmed|Checking the current PulseX V2 price|Wallet connected|Account changed|Wallet disconnected)/i.test(status) && <p className="status-line" role="status">{status}</p>}');
        source=replace(source,'    if (!selectedProvider) {','    if (window.cashxHost) selectedProvider = await window.cashxHost.connect();\n    if (!selectedProvider) {');
        source=replace(source,'      const savedKey = window.localStorage.getItem(walletPreferenceStorageKey);','      if (window.cashxHost) return;\n      const savedKey = window.localStorage.getItem(walletPreferenceStorageKey);');
        source=replace(source,'  useEffect(() => {\n    const handleAnnouncement',sharedEffect.replace('HOST_UPDATE','setWalletProvider(address ? window.ethereum : null); setAccount(address || null);')+'\n  useEffect(() => {\n    const handleAnnouncement');
      }
      if(slug==='cashx-nft'&&id.endsWith('/app/MintExperience.tsx')){
        source=replace(source,'{mintMessage && (','{mintMessage && !/^Mint submitted\\.|minted successfully\\.$/i.test(mintMessage) && (');
        source=source.replace(/      <header className="topbar">[\s\S]*?<\/header>/,'');
        source=replace(source,'{pageView === "mint" && <div className="nft-page" id="mint">','<div className="nft-page" id="mint">');
        source=replace(source,'      </div>}\n\n      {pageView === "farm" && (','      </div>\n\n      {false && (');
        source=source.replace(/\n      \{false && \(\n        <FarmPreview[\s\S]*?\n      \)\}/,'');
        source=replace(source,'    const ethereum = window.ethereum;','    if (window.cashxHost) await window.cashxHost.connect();\n    const ethereum = window.ethereum;');
        source=replace(source,'  useEffect(() => {\n    applyTheme(themeColors);',sharedEffect.replace('HOST_UPDATE','setWalletAddress(address); if(address) void refreshWalletBalances(address); else {setWalletBalance(null);setWalletNftCount(null);}')+'\n  useEffect(() => {\n    applyTheme(themeColors);');
      }
      if(slug==='cashmoney'&&id.endsWith('/src/App.jsx')){
        source=replace(source,"import StakePanel from './components/StakePanel'",'');
        source=source.replace(/      <nav className="cx-nav">[\s\S]*?<\/nav>/,'');
        source=replace(source,"{view === 'mint'\n          ? <MintPage wallet={wallet} onMinted={ids => setReveal({ ids })} tab={mintTab} onTabChange={setMintTab} />\n          : <StakePanel wallet={wallet} />}",'<MintPage wallet={wallet} onMinted={ids => setReveal({ ids })} tab={mintTab} onTabChange={setMintTab} />');
        source=replace(source,'px-4 pb-10 pt-28 sm:pb-14','px-4 pb-10 pt-6 sm:pb-14');
      }
      if(slug==='cashmoney'&&id.endsWith('/src/components/MintPage.jsx')){
        source=replace(source,'<MintPanel wallet={wallet} onMinted={onMinted} />','<div className="panel p-6"><h2>CashMoney NFT</h2><p className="muted mt-3">Minting is retired. Explore the collection here and manage your staked NFTs using the main Farms tab.</p></div>');
      }
      if(slug==='cashmoney'&&id.endsWith('/src/hooks/useWallet.js')){
        source=replace(source,'  const connect = useCallback(async () => {','  const connect = useCallback(async (silent = false) => {\n    if (window.cashxHost && silent !== true) await window.cashxHost.connect();');
        source=replace(source,"      await provider.send('eth_requestAccounts', [])","      await provider.send(silent === true ? 'eth_accounts' : 'eth_requestAccounts', [])");
        source=replace(source,'      if (cid !== NETWORK.CHAIN_ID) await switchNetwork()','      if (silent !== true && cid !== NETWORK.CHAIN_ID) await switchNetwork()');
        source=replace(source,'if (accounts.length > 0) connect()','if (accounts.length > 0) connect(true)');
        source=replace(source,'      else connect()','      else connect(true)');
        source=replace(source,'if (address) connect()','if (address) connect(true)');
      }
      if(slug==='cashmoney') source=source.replaceAll('src="/upls.png"','src="./upls.png"').replaceAll('src="/vouchpls.png"','src="./vouchpls.png"');
      return source.replaceAll('window.ethereum','(window.cashxHost?.provider || window.ethereum)');
    }
  }],css:{postcss:{plugins:slug==='cashx-nft'?[tailwind4()]:slug==='cashmoney'?[tailwind3({content:[path.join(root,'index.html'),path.join(root,'src/**/*.{js,jsx}')],theme:{extend:{fontFamily:{mono:['"Fira Code"','monospace']}}}}),autoprefixer()]:[]}},
  define:{'process.env.NEXT_PUBLIC_CASHX_CHAIN_ID':'"369"','process.env.NEXT_PUBLIC_CASHX_CONTRACT_ADDRESS':'"0x744351E2846498D040B649D694CAB21f32f14AFe"','process.env.NEXT_PUBLIC_CASHX_DEPLOYMENT_BLOCK':'"27306495"'},
  build:{outDir:path.resolve(here,'../tools',slug),emptyOutDir:true,chunkSizeWarningLimit:1500}});
}
