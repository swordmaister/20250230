
from playwright.sync_api import sync_playwright

def verify_mobile_ui():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Load via localhost since file:// failed
        page.goto('http://localhost:8080/index.html')

        # Wait for start screen
        page.wait_for_selector('#start-screen')

        # Click Awakened Mode
        page.click('#start-awk')

        # Wait for HUD and UI layer
        page.wait_for_selector('#hud', state='visible')
        page.wait_for_timeout(1000)

        # Check that btnZekkai is NOT visible (should be removed from DOM)
        zekkai_btn = page.query_selector('#btnZekkai')
        if zekkai_btn:
            print('ERROR: Zekkai button found but should be removed')
        else:
            print('SUCCESS: Zekkai button removed')

        # Check Mode Switch exists
        mode_btn = page.query_selector('#modeSwitch')
        if mode_btn:
            print('SUCCESS: Mode Switch button found')

        page.screenshot(path='verification/mobile_ui_check.png')
        browser.close()

if __name__ == '__main__':
    verify_mobile_ui()
