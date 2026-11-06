import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
import './install-app.css';

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{outcome: 'accepted' | 'dismissed'}>;
};
const installed = () => window.matchMedia('(display-mode: standalone)').matches ||
  Boolean((navigator as Navigator & {standalone?: boolean}).standalone);

export default function InstallAppButton() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [alreadyInstalled, setAlreadyInstalled] = useState(installed);
  const [instructions, setInstructions] = useState(false);
  const [working, setWorking] = useState(false);
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPrompt);
    };
    const onInstalled = () => { setAlreadyInstalled(true); setPrompt(null); setInstructions(false); };
    const onDisplay = () => setAlreadyInstalled(installed());
    const mq=window.matchMedia('(display-mode: standalone)');
    window.addEventListener('beforeinstallprompt',onPrompt);
    window.addEventListener('appinstalled',onInstalled);
    mq.addEventListener?.('change',onDisplay);
    return () => {
      window.removeEventListener('beforeinstallprompt',onPrompt);
      window.removeEventListener('appinstalled',onInstalled);
      mq.removeEventListener?.('change',onDisplay);
    };
  }, []);

  async function install() {
    if (!prompt) { setInstructions(true); return; }
    setWorking(true);
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if(choice.outcome==='accepted') { setPrompt(null); setInstructions(false); }
    } catch { setInstructions(true); }
    finally { setWorking(false); }
  }
  if (alreadyInstalled) return null;
  return <>
    <button type="button" className="asy-install-button" onClick={() => void install()} disabled={working}>
      <Download size={15}/> {working?'Opening…':'Install App'}
    </button>
    {instructions && <div className="asy-install-backdrop" onMouseDown={e=>{if(e.currentTarget===e.target)setInstructions(false);}}>
      <section className="asy-install-dialog" role="dialog" aria-modal="true" aria-labelledby="asy-install-heading">
        <button type="button" className="asy-install-close" aria-label="Close installation instructions" onClick={()=>setInstructions(false)}><X size={19}/></button>
        <img src="/resources/asylum-community-logo.jpg" alt="ASYLUM COMMUNITY logo" />
        <h3 id="asy-install-heading">Install ASYLUM COMMUNITY</h3>
        <p>Use the official Dashboard like an app, with our logo on your Home Screen.</p>
        {isIOS ? <p><strong>iPhone / iPad:</strong> Open the link in Safari, tap <strong>Share</strong>, then choose <strong>Add to Home Screen</strong> → <strong>Add</strong>.</p> :
          <p><strong>Android:</strong> Open this website in Chrome, tap <strong>⋮</strong>, then choose <strong>Install app</strong> or <strong>Add to Home screen</strong>. On desktop Chrome/Edge, use the install icon in the address bar or browser menu.</p>}
        <small>If opened inside Messenger or TikTok, choose <strong>Open in browser</strong> first.</small>
        <button type="button" className="asy-install-understood" onClick={()=>setInstructions(false)}>Got it</button>
      </section>
    </div>}
  </>;
}
