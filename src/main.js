import { Game } from './game.js';
import { StandardMode } from './modes/standard.js';
import { AwakenedMode } from './modes/awakened.js';
import { InfiniteMode } from './modes/infinite.js';

window.onload = function() {
    // Mode Selection Screen
    const modeScreen = document.createElement('div');
    modeScreen.id = 'mode-screen';
    modeScreen.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:#000;z-index:9999;display:flex;flex-direction:column;justify-content:center;align-items:center;color:#fff;font-family:sans-serif;';

    const title = document.createElement('h1');
    title.textContent = "True Kekkai VR";
    title.style.cssText = "font-size:48px; text-shadow:0 0 20px #0f0; margin-bottom:60px; color:#fff;";
    modeScreen.appendChild(title);

    const btnStandard = createButton("Standard Mode", "#0f0", "Original Sensitivity Tuned Experience");
    const btnAwakened = createButton("Awakened Mode", "#a0f", "Absolute Boundary & Chain Destruction");
    const btnInfinite = createButton("Infinite Mode", "#f00", "Endless Survival (Spec 6)");

    btnStandard.onclick = () => startGame(new StandardMode());
    btnAwakened.onclick = () => startGame(new AwakenedMode());
    btnInfinite.onclick = () => startGame(new InfiniteMode());

    modeScreen.appendChild(btnStandard);
    modeScreen.appendChild(document.createElement('br'));
    modeScreen.appendChild(btnAwakened);
    modeScreen.appendChild(document.createElement('br'));
    modeScreen.appendChild(btnInfinite);
    document.body.appendChild(modeScreen);

    function createButton(text, color, sub) {
        const c = document.createElement('div');
        c.style.textAlign = 'center';

        const b = document.createElement('button');
        b.textContent = text;
        b.style.cssText = `padding:20px 60px; font-size:24px; font-weight:bold; color:${color}; background:rgba(0,0,0,0.8); border:3px solid ${color}; border-radius:12px; cursor:pointer; min-width:300px; box-shadow:0 0 15px ${color}; transition:transform 0.1s;`;
        b.onmouseover = () => { b.style.transform = 'scale(1.05)'; b.style.background = 'rgba(255,255,255,0.1)'; };
        b.onmouseout = () => { b.style.transform = 'scale(1.0)'; b.style.background = 'rgba(0,0,0,0.8)'; };

        const s = document.createElement('div');
        s.textContent = sub;
        s.style.cssText = "margin-top:8px; font-size:14px; color:#aaa;";

        c.appendChild(b);
        c.appendChild(s);
        return c;
    }

    function startGame(modeInstance) {
        modeScreen.style.opacity = 0;
        setTimeout(() => modeScreen.remove(), 500);
        const game = new Game(modeInstance);
        game.init();
    }
};
