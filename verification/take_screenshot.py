from playwright.sync_api import sync_playwright

def verify_game_screenshot():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            page.goto("http://localhost:8080/index.html")
            page.wait_for_timeout(3000) # Wait for game to init and fade out overlay
            page.screenshot(path="verification/game_screenshot.png")
            print("Screenshot taken")
        except Exception as e:
            print(f"Error: {e}")
        finally:
            browser.close()

if __name__ == "__main__":
    verify_game_screenshot()
