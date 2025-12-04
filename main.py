import threading
import time
import os
import sys

# Ensure the app directory is in path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app import start_server

def run_flask():
    start_server()

if __name__ == '__main__':
    # Start Flask in a separate thread
    flask_thread = threading.Thread(target=run_flask)
    flask_thread.daemon = True
    flask_thread.start()

    # Wait for server to start
    time.sleep(1)

    # Launch WebView
    # Check if we are on Android
    if 'ANDROID_ARGUMENT' in os.environ:
        try:
            from android.permissions import request_permissions, Permission
            request_permissions([Permission.INTERNET, Permission.WRITE_EXTERNAL_STORAGE, Permission.READ_EXTERNAL_STORAGE])
        except ImportError:
            pass

        # Use Kivy or similar to open WebView?
        # Actually, standard Buildozer "flask" recipe often uses a simple webview bootstrap.
        # But if we use the standard Kivy bootstrap, we need to open a WebView.

        try:
            from jnius import autoclass
            from android.runnable import run_on_ui_thread

            WebView = autoclass('android.webkit.WebView')
            WebViewClient = autoclass('android.webkit.WebViewClient')
            activity = autoclass('org.kivy.android.PythonActivity').mActivity

            @run_on_ui_thread
            def create_webview():
                webview = WebView(activity)
                webview.setWebViewClient(WebViewClient())
                webview.getSettings().setJavaScriptEnabled(True)
                webview.getSettings().setDomStorageEnabled(True)
                webview.loadUrl('http://127.0.0.1:5000')
                activity.setContentView(webview)

            create_webview()

        except ImportError:
             # Fallback or if using 'webview' bootstrap (p4a)
             import webbrowser
             webbrowser.open('http://127.0.0.1:5000')

    else:
        # Local Desktop Test
        print("Running on Desktop. Open http://localhost:5000")
        while True:
            time.sleep(1)
