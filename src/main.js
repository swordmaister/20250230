import { Game } from './game.js';
import { StandardMode } from './modes/standard.js';
import { AwakenedMode } from './modes/awakened.js';

let gameInstance = null;

document.addEventListener('DOMContentLoaded', () => {
    const startScreen = document.getElementById('start-screen');
    const stdBtn = document.getElementById('start-std');
    const awkBtn = document.getElementById('start-awk');

    stdBtn.addEventListener('click', () => startGame('standard'));
    awkBtn.addEventListener('click', () => startGame('awakened'));

    function startGame(modeName) {
        startScreen.style.opacity = '0';
        setTimeout(() => {
            startScreen.style.display = 'none';
            document.getElementById('hud').style.display = 'block';
            document.getElementById('uiLayer').style.display = 'block';
            document.getElementById('vrBtn').style.display = 'block';

            let mode;
            if (modeName === 'awakened') {
                document.body.classList.add('awakened-mode');
                document.getElementById('hud').classList.add('awakened-hud');
                document.getElementById('btnZekkai').style.display = 'flex';
                mode = new AwakenedMode();
            } else {
                mode = new StandardMode();
            }

            gameInstance = new Game(mode);
            gameInstance.init();
        }, 500);
    }
});
