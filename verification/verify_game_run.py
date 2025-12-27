
from playwright.sync_api import sync_playwright

def verify_enemies_load():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto('http://localhost:8080/index.html')
        page.wait_for_selector('#start-screen')
        page.click('#start-std')
        page.wait_for_selector('#hud', state='visible')
        page.wait_for_timeout(2000)

        # We can't easily check internal enemy state via DOM (canvas only),
        # but if the game loop crashes due to syntax errors in new enemy logic,
        # we might catch an error dialog or console error.

        # Check for error log
        error_box = page.query_selector('#error-log')
        if error_box and error_box.is_visible():
            print('ERROR: Game crashed')
            print(error_box.text_content())
        else:
            print('SUCCESS: Game running without immediate crash')

        browser.close()

if __name__ == '__main__':
    verify_enemies_load()
