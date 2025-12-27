
from playwright.sync_api import sync_playwright

def verify_result_screen():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto('http://localhost:8080/index.html')
        page.wait_for_selector('#start-screen')
        page.click('#start-std')
        page.wait_for_selector('#hud', state='visible')

        # Simulate Win Condition: Force wave to 21
        page.evaluate('gameInstance.gameState.wave = 21;')
        page.evaluate('gameInstance.showResult();')

        # Verify Result Screen Visible
        page.wait_for_selector('#result-screen', state='visible')
        content = page.text_content('#result-stats')
        print('Result Screen Content:', content)

        if 'SCORE:' in content and 'RANK' in content:
            print('SUCCESS: Score and Rank displayed')
        else:
            print('ERROR: Score/Rank missing')

        page.screenshot(path='verification/result_check.png')
        browser.close()

if __name__ == '__main__':
    verify_result_screen()
