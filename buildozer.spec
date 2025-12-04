[app]

# (str) Title of your application
title = NoteNet 3D

# (str) Package name
package.name = notenet3d

# (str) Package domain (needed for android/ios packaging)
package.domain = org.jules

# (str) Source code where the main.py live
source.dir = .

# (list) Source files to include (let empty to include all the files)
source.include_exts = py,png,jpg,kv,atlas,html,css,js,json,txt

# (list) Application requirements
# comma separated e.g. requirements = sqlite3,kivy
requirements = python3,flask,flask_sqlalchemy,sqlalchemy,openssl,sqlite3,jnius,android,kivy

# (str) Custom source folders for requirements
# Sets custom source for any requirements with recipes
# requirements.source.kivy = ../../kivy

# (str) Presplash of the application
# presplash.filename = %(source.dir)s/data/presplash.png

# (str) Icon of the application
# icon.filename = %(source.dir)s/data/icon.png

# (str) Supported orientation (one of landscape, sensorLandscape, portrait or all)
orientation = portrait

# (bool) Indicate if the application should be fullscreen or not
fullscreen = 1

# (list) Permissions
android.permissions = INTERNET,WRITE_EXTERNAL_STORAGE,READ_EXTERNAL_STORAGE

# (int) Target Android API, should be as high as possible (distutils)
android.api = 33

# (int) Minimum API your APK will support.
android.minapi = 21

# (str) Android NDK version to use
android.ndk = 25b

# (bool) Use --private data storage (True) or --dir public storage (False)
# private is better for notes db
android.private_storage = True

# (str) Bootstrap to use for android builds
# p4a.bootstrap = webview  <-- We use sdl2/kivy with custom webview or just standard
# standard sdl2 is default

[buildozer]

# (int) Log level (0 = error only, 1 = info, 2 = debug (with command output))
log_level = 2

# (int) Display warning if buildozer is run as root (0 = False, 1 = True)
warn_on_root = 1
