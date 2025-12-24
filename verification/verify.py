
from playwright.sync_api import sync_playwright

def verify_kekkai_ui():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Load the index.html directly
        page.goto('file:///home/jules/index.html')

        # Check Start Screen
        page.wait_for_selector('#start-screen')
        page.screenshot(path='/home/jules/verification/start_screen.png')
        print('Captured Start Screen')

        # Click Standard Mode
        page.click('#start-std')

        # Wait for HUD
        page.wait_for_selector('#hud', state='visible')
        page.wait_for_timeout(1000) # Wait for fade effects
        page.screenshot(path='/home/jules/verification/standard_hud.png')
        print('Captured Standard Mode HUD')

        # Reload for Awakened Mode
        page.reload()
        page.wait_for_selector('#start-screen')

        # Click Awakened Mode
        page.click('#start-awk')

        # Wait for HUD
        page.wait_for_selector('#hud', state='visible')
        page.wait_for_timeout(1000)
        page.screenshot(path='/home/jules/verification/awakened_hud.png')
        print('Captured Awakened Mode HUD')

        browser.close()

if __name__ == '__main__':
    verify_kekkai_ui()
